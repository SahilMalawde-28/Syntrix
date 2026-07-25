# flask-backend/app.py
import subprocess, json, os
from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

BASE_DIR  = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'automation_platform'))
INVENTORY = os.path.join(BASE_DIR, 'inventory', 'hosts.ini')
PLAYBOOKS = os.path.join(BASE_DIR, 'playbooks')
ANS_CFG   = os.path.join(BASE_DIR, 'ansible.cfg')

def _cmd(playbook, extra=None, hosts='lab'):
    cmd = ['ansible-playbook', os.path.join(PLAYBOOKS, playbook), '-i', INVENTORY, '-e', f'target_hosts={hosts}']
    if extra:
        for k, v in extra.items():
            cmd += ['-e', f'{k}={v}']
    return cmd

def run_pb(playbook, extra=None, hosts='lab'):
    env = {**os.environ, 'ANSIBLE_CONFIG': ANS_CFG}
    r = subprocess.run(_cmd(playbook, extra, hosts), capture_output=True, text=True, cwd=BASE_DIR, env=env)
    return {'success': r.returncode == 0, 'stdout': r.stdout, 'stderr': r.stderr,
            'returncode': r.returncode, 'timestamp': datetime.now().isoformat()}

def stream_pb(playbook, extra=None, hosts='lab'):
    env = {**os.environ, 'ANSIBLE_CONFIG': ANS_CFG}
    proc = subprocess.Popen(_cmd(playbook, extra, hosts), stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, cwd=BASE_DIR, env=env)
    for line in proc.stdout:
        yield f"data: {json.dumps({'line': line.rstrip()})}\n\n"
    proc.wait()
    yield f"data: {json.dumps({'done': True, 'returncode': proc.returncode})}\n\n"

def adhoc(hosts, module, args=''):
    cmd = ['ansible', hosts, '-m', module, '-i', INVENTORY]
    if args: cmd += ['-a', args]
    env = {**os.environ, 'ANSIBLE_CONFIG': ANS_CFG}
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=BASE_DIR, env=env)
    return {'success': r.returncode == 0, 'stdout': r.stdout, 'stderr': r.stderr,
            'timestamp': datetime.now().isoformat()}

SSE_HEADERS = {'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive'}

# ── Health ───────────────────────────────────────────────────────────────────
@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'version': '2.0.0', 'timestamp': datetime.now().isoformat()})

# ── Domain 8: Backup ─────────────────────────────────────────────────────────
@app.route('/api/backup/run', methods=['POST'])
def backup_run():
    d = request.json or {}
    return jsonify(run_pb('backup_config_files.yml', hosts=d.get('hosts','windows_lab')))

@app.route('/api/backup/run/stream')
def backup_stream():
    return Response(stream_with_context(stream_pb('backup_config_files.yml',
        hosts=request.args.get('hosts','windows_lab'))), mimetype='text/event-stream', headers=SSE_HEADERS)

@app.route('/api/backup/restore', methods=['POST'])
def backup_restore():
    d = request.json or {}
    if not d.get('backup_id'): return jsonify({'success':False,'error':'backup_id required'}), 400
    return jsonify(run_pb('restore_config.yml', {'backup_id': d['backup_id']}, d.get('hosts','windows_lab')))

@app.route('/api/backup/restore/stream')
def restore_stream():
    return Response(stream_with_context(stream_pb('restore_config.yml',
        {'backup_id': request.args.get('backup_id','')},
        request.args.get('hosts','windows_lab'))), mimetype='text/event-stream', headers=SSE_HEADERS)

@app.route('/api/backup/verify', methods=['POST'])
def backup_verify():
    d = request.json or {}
    return jsonify(run_pb('verify_backups.yml', hosts=d.get('hosts','windows_lab')))

@app.route('/api/backup/verify/stream')
def verify_stream():
    return Response(stream_with_context(stream_pb('verify_backups.yml',
        hosts=request.args.get('hosts','windows_lab'))), mimetype='text/event-stream', headers=SSE_HEADERS)

@app.route('/api/backup/user', methods=['POST'])
def backup_user():
    d = request.json or {}
    return jsonify(run_pb('backup_user_data.yml', {'target_user': d.get('username','labuser')}, d.get('hosts','windows_lab')))

@app.route('/api/backup/schedule', methods=['POST'])
def backup_schedule():
    d = request.json or {}
    return jsonify(run_pb('schedule_backup.yml', {'sched_interval_min': d.get('interval',1440)}, d.get('hosts','windows_lab')))

@app.route('/api/backup/cleanup', methods=['POST'])
def backup_cleanup():
    d = request.json or {}
    return jsonify(run_pb('cleanup_backups.yml', {'keep_latest': d.get('keep',5)}, d.get('hosts','windows_lab')))

# ── Domain 1: Users ───────────────────────────────────────────────────────────
@app.route('/api/users/create', methods=['POST'])
def users_create():
    d = request.json or {}
    return jsonify(run_pb('create_user.yml', {'username': d.get('username'), 'password': d.get('password')}, d.get('hosts','lab')))

@app.route('/api/users/delete', methods=['POST'])
def users_delete():
    d = request.json or {}
    return jsonify(run_pb('delete_user.yml', {'username': d.get('username')}, d.get('hosts','lab')))

@app.route('/api/users/list')
def users_list():
    return jsonify(adhoc('lab', 'shell', 'getent passwd | awk -F: "$3>=1000 {print $1}"'))

# ── Domain 2: Software ────────────────────────────────────────────────────────
@app.route('/api/software/install', methods=['POST'])
def sw_install():
    d = request.json or {}
    return jsonify(run_pb('install_package.yml', {'package_name': d.get('package')}, d.get('hosts','lab')))

@app.route('/api/software/remove', methods=['POST'])
def sw_remove():
    d = request.json or {}
    return jsonify(run_pb('remove_package.yml', {'package_name': d.get('package')}, d.get('hosts','lab')))

# ── Domain 3: Config ──────────────────────────────────────────────────────────
@app.route('/api/config/apply', methods=['POST'])
def config_apply():
    d = request.json or {}
    return jsonify(run_pb('apply_config.yml', hosts=d.get('hosts','lab')))

# ── Domain 4: Monitor ─────────────────────────────────────────────────────────
@app.route('/api/monitor/disk')
def monitor_disk():   return jsonify(adhoc('lab', 'shell', 'df -h'))
@app.route('/api/monitor/memory')
def monitor_memory(): return jsonify(adhoc('linux_lab', 'shell', 'free -m'))
@app.route('/api/monitor/uptime')
def monitor_uptime(): return jsonify(adhoc('lab', 'shell', 'uptime'))

# ── Domain 5: Patches ─────────────────────────────────────────────────────────
@app.route('/api/patches/update', methods=['POST'])
def patches_update():
    d = request.json or {}
    return jsonify(run_pb('patch_update.yml', hosts=d.get('hosts','lab')))

# ── Domain 6: Services ────────────────────────────────────────────────────────
@app.route('/api/services/restart', methods=['POST'])
def services_restart():
    d = request.json or {}
    return jsonify(adhoc(d.get('hosts','lab'), 'service', f"name={d.get('service')} state=restarted"))

# ── Domain 7: Network ─────────────────────────────────────────────────────────
@app.route('/api/network/ping', methods=['POST'])
def net_ping():
    d = request.json or {}
    return jsonify(adhoc(d.get('hosts','lab'), 'shell', f"ping -c 4 {d.get('target','8.8.8.8')}"))

# ── Domain 9: Logs ────────────────────────────────────────────────────────────
@app.route('/api/logs/collect', methods=['POST'])
def logs_collect():
    d = request.json or {}
    return jsonify(run_pb('collect_logs.yml', hosts=d.get('hosts','lab')))

# ── Domain 10: Provision ──────────────────────────────────────────────────────
@app.route('/api/provision/new', methods=['POST'])
def provision_new():
    d = request.json or {}
    return jsonify(run_pb('provision_node.yml', hosts=d.get('hosts','lab')))

# ── Domain 11: Compliance ─────────────────────────────────────────────────────
@app.route('/api/compliance/check', methods=['POST'])
def compliance_check():
    d = request.json or {}
    return jsonify(run_pb('compliance_check.yml', hosts=d.get('hosts','lab')))

# ── Domain 12: Diagnostics ────────────────────────────────────────────────────
@app.route('/api/diagnostics/run', methods=['POST'])
def diagnostics_run():
    d = request.json or {}
    return jsonify(run_pb('diagnostics.yml', hosts=d.get('hosts','lab')))

if __name__ == '__main__':
    print('[USAP Flask] Starting on http://127.0.0.1:5000')
    app.run(host='127.0.0.1', port=5000, debug=False, threaded=True)
