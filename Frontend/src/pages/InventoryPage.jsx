import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../api/client';

// Helper to parse Ansible setup stdout into clean JSON
function parseAnsibleFacts(rawStdout) {
  if (!rawStdout || typeof rawStdout !== 'string') return {};

  const hostMap = {};

  // Matches both CLI output "host | SUCCESS => {" and Playbook output "ok: [host] => {"
  const regex = /(?:(?:ok|changed):\s*\[([^\]]+)\]|([a-zA-Z0-9_\.-]+)\s*\|\s*SUCCESS)\s*=>\s*(\{[\s\S]*?\n\})/g;
  let match;

  while ((match = regex.exec(rawStdout)) !== null) {
    const host = match[1] || match[2];
    const jsonBlock = match[3];

    try {
      const parsed = JSON.parse(jsonBlock);
      const facts = parsed.ansible_facts || parsed;

      hostMap[host] = {
        host: host,
        ip: facts.ansible_default_ipv4?.address || facts.ansible_all_ipv4_addresses?.[0] || 'Unknown',
        os: facts.ansible_distribution ? `${facts.ansible_distribution} ${facts.ansible_distribution_version}` : (facts.ansible_os_family || 'Linux'),
        kernel: facts.ansible_kernel || 'N/A',
        cpuCores: facts.ansible_processor_vcpus || facts.ansible_processor_count || 'N/A',
        totalRam: facts.ansible_memtotal_mb ? `${(facts.ansible_memtotal_mb / 1024).toFixed(1)} GB` : 'N/A',
        arch: facts.ansible_architecture || 'x86_64',
        pythonVersion: facts.ansible_python_version || 'N/A',
        lastGathered: new Date().toLocaleTimeString()
      };
    } catch (err) {
      console.error('Error parsing facts for host:', host, err);
    }
  }

  return hostMap;
}

export default function InventoryPage() {
  const [inventoryRegistry, setInventoryRegistry] = useState({});
  const [isLoadingFile, setIsLoadingFile] = useState(true);

  const [gatheredSpecs, setGatheredSpecs] = useState(() => {
    try {
      const saved = sessionStorage.getItem('ansible_gathered_specs');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isGathering, setIsGathering] = useState(false);
  const [scanError, setScanError] = useState(null);

  const [showAddHostModal, setShowAddHostModal] = useState(false);
  const [showAssignGroupModal, setShowAssignGroupModal] = useState(null);
  const [selectedHostSpecs, setSelectedHostSpecs] = useState(null);

  // New Host Form Fields
  const [newHostAlias, setNewHostAlias] = useState('');
  const [newHostMac, setNewHostMac] = useState('');
  const [newHostIp, setNewHostIp] = useState('');
  const [newHostOs, setNewHostOs] = useState('Linux');
  const [newHostGroup, setNewHostGroup] = useState('linux_hosts');

  const [targetGroupInput, setTargetGroupInput] = useState('');

  // ----------------------------------------------------
  // REAL INVENTORY FILE IO (IPC)
  // ----------------------------------------------------

  async function loadInventoryFromDisk() {
    setIsLoadingFile(true);
    setScanError(null);
    try {
      if (api.getInventoryRegistry) {
        const res = await api.getInventoryRegistry();
        if (res.success) {
          const rawReg = res.registry || {};
          const cleanedReg = {};
          
          Object.keys(rawReg).forEach(key => {
            const item = rawReg[key];
            const rawGroups = item.groups || (item.group ? [item.group] : []);
            const cleanGroups = Array.from(
              new Set(
                rawGroups
                  .flatMap(g => (typeof g === 'string' ? g.split(/[;,]/) : [g]))
                  .map(g => String(g).trim())
                  .filter(Boolean)
              )
            );
            cleanedReg[key] = {
              ...item,
              groups: cleanGroups.length > 0 ? cleanGroups : [(item.os || '').toLowerCase() === 'windows' ? 'windows_hosts' : 'linux_hosts']
            };
          });

          setInventoryRegistry(cleanedReg);
        } else {
          setScanError(`Failed to read inventory file: ${res.error}`);
        }
      }
    } catch (err) {
      setScanError(`Error contacting backend IPC bridge: ${err.message}`);
    } finally {
      setIsLoadingFile(false);
    }
  }

  useEffect(() => {
    loadInventoryFromDisk();
  }, []);

  useEffect(() => {
    sessionStorage.setItem('ansible_gathered_specs', JSON.stringify(gatheredSpecs));
  }, [gatheredSpecs]);

  const allAnsibleGroups = ['ALL', ...new Set(
    Object.values(inventoryRegistry).flatMap(h => h.groups || [])
  )];

  async function saveRegistryToDisk(updatedRegistry) {
    setInventoryRegistry(updatedRegistry);
    if (api.updateInventoryRegistry) {
      const res = await api.updateInventoryRegistry(updatedRegistry);
      if (!res.success) {
        setScanError(`Failed to update inventory file: ${res.error}`);
      }
    }
  }

  // 1. Trigger Ansible Facts Gathering
  async function handleGatherSpecs() {
    setIsGathering(true);
    setScanError(null);

    try {
      // NOTE: 'inventory'/'gather_facts' has no matching sub-parser in
      // main.py yet (only user/telemetry/monitor exist). This call will
      // reach the backend and fail with an argparse error until an
      // inventory_controller.py + sub-parser is added, or this is rewired
      // to something like domain='telemetry', action='get-stats'.
      const response = await api.runAutomation('inventory', 'gather_facts', {
        target: selectedGroup === 'ALL' ? 'all' : selectedGroup
      });

      const parsed = parseAnsibleFacts(response?.stdout);

      if (Object.keys(parsed).length === 0) {
        setScanError(`No live Ansible facts returned for group '${selectedGroup}'. Check SSH connectivity or credentials.`);
      } else {
        setGatheredSpecs(prev => ({ ...prev, ...parsed }));
      }
    } catch (err) {
      console.error('Failed to gather facts:', err);
      setScanError(err.message || 'Failed to execute Ansible facts gathering.');
    } finally {
      setIsGathering(false);
    }
  }

  // 2. Add New Device
  async function handleAddDevice(e) {
    e.preventDefault();
    if (!newHostAlias.trim() || !newHostIp.trim()) return;

    const hostKey = newHostAlias.trim();
    const osChoice = newHostOs || 'Linux';
    const defaultGroup = osChoice.toLowerCase() === 'windows' ? 'windows_hosts' : 'linux_hosts';
    
    const userGroups = newHostGroup
      .split(/[;,]/)
      .map(g => g.trim())
      .filter(Boolean);

    const finalGroups = userGroups.length > 0 ? Array.from(new Set(userGroups)) : [defaultGroup];

    const updatedRegistry = {
      ...inventoryRegistry,
      [hostKey]: {
        ip: newHostIp.trim(),
        mac_address: newHostMac.trim() || 'UNKNOWN',
        status: 'online',
        os: osChoice,
        groups: finalGroups
      }
    };

    await saveRegistryToDisk(updatedRegistry);

    setNewHostAlias('');
    setNewHostMac('');
    setNewHostIp('');
    setNewHostOs('Linux');
    setNewHostGroup('linux_hosts');
    setShowAddHostModal(false);
  }

  // 3. Assign Device to Group(s)
  async function handleAssignToGroup(hostKey) {
    if (!targetGroupInput.trim()) return;

    const groupsToAdd = targetGroupInput
      .split(/[;,]/)
      .map(g => g.trim())
      .filter(Boolean);

    const currentHost = inventoryRegistry[hostKey];

    if (!currentHost || groupsToAdd.length === 0) return;

    const updatedGroups = Array.from(new Set([...(currentHost.groups || []), ...groupsToAdd]));

    const updatedRegistry = {
      ...inventoryRegistry,
      [hostKey]: {
        ...currentHost,
        groups: updatedGroups
      }
    };

    await saveRegistryToDisk(updatedRegistry);
    setTargetGroupInput('');
    setShowAssignGroupModal(null);
  }

  // 4. Remove Device from specific Group
  async function handleRemoveFromGroup(hostKey, groupToRemove) {
    const currentHost = inventoryRegistry[hostKey];
    if (!currentHost) return;

    let updatedGroups = (currentHost.groups || []).filter(g => g !== groupToRemove);

    // Fallback default group if array becomes empty
    if (updatedGroups.length === 0) {
      const isWin = (currentHost.os || '').toLowerCase() === 'windows';
      updatedGroups = [isWin ? 'windows_hosts' : 'linux_hosts'];
    }

    const updatedRegistry = {
      ...inventoryRegistry,
      [hostKey]: {
        ...currentHost,
        groups: updatedGroups
      }
    };

    await saveRegistryToDisk(updatedRegistry);
  }

  // 5. Delete Device
  async function handleDeleteDevice(hostKey) {
    const updated = { ...inventoryRegistry };
    delete updated[hostKey];
    await saveRegistryToDisk(updated);
  }

  // Filtering
  const hostKeys = Object.keys(inventoryRegistry);
  const filteredHostKeys = hostKeys.filter(key => {
    const item = inventoryRegistry[key];
    const matchesSearch = key.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.ip.includes(searchTerm) ||
                          (item.mac_address && item.mac_address.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesGroup = selectedGroup === 'ALL' || (item.groups && item.groups.includes(selectedGroup));

    return matchesSearch && matchesGroup;
  });

  return (
    <div className="p-6 w-full flex flex-col gap-6 text-white font-sans">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-wide text-purple-400 flex items-center gap-2">
            <span>🗂️</span> Inventory Manager (`hosts_inventory.csv`)
          </h1>
          <p className="text-xs text-white/50 mt-0.5">
            Auto-discovers live IP changes by MAC ID and excludes offline hosts from `hosts.ini`.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadInventoryFromDisk}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all"
            title="Reload inventory from disk"
          >
            🔄 Reload
          </button>

          <button
            onClick={() => setShowAddHostModal(true)}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg transition-all flex items-center gap-1.5"
          >
            <span>➕</span> Add New Device
          </button>

          <button
            onClick={handleGatherSpecs}
            disabled={isGathering}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {isGathering ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Scanning Specs…
              </>
            ) : (
              <>⚡ Discover Specs (Ansible Setup)</>
            )}
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {scanError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-300 flex items-center justify-between">
          <span>⚠️ {scanError}</span>
          <button onClick={() => setScanError(null)} className="text-white/50 hover:text-white">✕</button>
        </div>
      )}

      {/* Group Filter Tabs & Search Bar */}
      <div className="bg-neutral-900/80 border border-white/10 rounded-xl p-4 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
        
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
          <span className="text-xs text-white/40 font-mono mr-1">Groups:</span>
          {allAnsibleGroups.map(grp => (
            <button
              key={grp}
              onClick={() => setSelectedGroup(grp)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all whitespace-nowrap ${
                selectedGroup === grp
                  ? 'bg-purple-600 text-white font-semibold shadow-md'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              [{grp}]
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="🔍 Search alias, IP, or MAC..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-black/40 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-purple-500 w-full md:w-64 font-mono"
        />
      </div>

      {/* Main Managed Devices Table */}
      <motion.div className="bg-neutral-900/80 border border-white/10 rounded-xl p-4 shadow-lg backdrop-blur-md" whileHover={{ y: -1 }}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-sm font-semibold text-white/90">
              Registered System Inventory
            </h2>
            <span className="text-xs font-mono text-white/40">{filteredHostKeys.length} Host(s) Listed</span>
          </div>

          {isLoadingFile ? (
            <div className="py-12 text-center text-white/40 text-xs font-mono">
              Loading inventory file from disk...
            </div>
          ) : filteredHostKeys.length === 0 ? (
            <div className="py-12 text-center text-white/30 text-xs border border-dashed border-white/10 rounded-lg flex flex-col items-center justify-center gap-2">
              <span>No devices found matching group target '[{selectedGroup}]'.</span>
              <span className="text-purple-400 font-medium">Click "Add New Device" to register a host.</span>
            </div>
          ) : (
            <div className="block max-h-[450px] overflow-y-auto overflow-x-auto rounded-lg border border-white/10 bg-black/30">
              <table className="w-full text-left border-collapse text-xs relative">
                <thead className="sticky top-0 bg-neutral-900 text-white/50 font-medium z-10">
                  <tr className="border-b border-white/10">
                    <th className="py-2.5 px-3 bg-neutral-900">Host Alias</th>
                    <th className="py-2.5 px-3 bg-neutral-900">Current IP</th>
                    <th className="py-2.5 px-3 bg-neutral-900">MAC Address</th>
                    <th className="py-2.5 px-3 bg-neutral-900">OS / Status</th>
                    <th className="py-2.5 px-3 bg-neutral-900">Inventory Groups</th>
                    <th className="py-2.5 px-3 bg-neutral-900">Discovered Specs</th>
                    <th className="py-2.5 px-3 bg-neutral-900 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredHostKeys.map(hostKey => {
                    const hostData = inventoryRegistry[hostKey];
                    const specData = gatheredSpecs[hostKey];
                    const isOnline = hostData.status?.toLowerCase() === 'online';

                    return (
                      <tr key={hostKey} className="hover:bg-white/[0.02] transition-colors">
                        
                        {/* Host Alias */}
                        <td className="py-2.5 px-3 font-semibold text-white font-mono flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}></span>
                          {hostKey}
                        </td>

                        {/* Current IP */}
                        <td className="py-2.5 px-3 font-mono text-emerald-400">{hostData.ip}</td>

                        {/* MAC Address */}
                        <td className="py-2.5 px-3 font-mono text-white/60">{hostData.mac_address || 'UNKNOWN'}</td>

                        {/* Status & OS Badge */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                              isOnline ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                            }`}>
                              {isOnline ? 'ONLINE' : 'OFFLINE'}
                            </span>
                            <span className="text-[10px] text-white/40 font-mono">({hostData.os || 'Linux'})</span>
                          </div>
                        </td>

                        {/* Groups Badges */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {hostData.groups?.map(g => (
                              <span
                                key={g}
                                className="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono flex items-center gap-1"
                              >
                                {g}
                                <button
                                  onClick={() => handleRemoveFromGroup(hostKey, g)}
                                  className="hover:text-red-400 text-white/40 ml-0.5"
                                  title={`Remove from group [${g}]`}
                                >
                                  ✕
                                </button>
                              </span>
                            ))}

                            <button
                              onClick={() => setShowAssignGroupModal(hostKey)}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border border-white/10"
                              title="Assign to another group"
                            >
                              + group
                            </button>
                          </div>
                        </td>

                        {/* Specs Preview */}
                        <td className="py-2.5 px-3">
                          {specData ? (
                            <button
                              onClick={() => setSelectedHostSpecs(specData)}
                              className="text-emerald-400 hover:underline font-mono text-[11px]"
                            >
                              {specData.cpuCores} vCPUs | {specData.totalRam} ({specData.os})
                            </button>
                          ) : (
                            <span className="text-white/30 italic text-[11px]">Unscanned (Click Discover Specs)</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {specData && (
                              <button
                                onClick={() => setSelectedHostSpecs(specData)}
                                className="px-2 py-1 rounded bg-purple-500/20 hover:bg-purple-600 text-[11px] text-purple-300 hover:text-white border border-purple-500/30 transition-all font-medium"
                              >
                                Specs 🔍
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteDevice(hostKey)}
                              className="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500 text-[11px] text-red-400 hover:text-white border border-red-500/20 transition-all"
                              title="Delete host from inventory"
                            >
                              Delete 🗑️
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </motion.div>

      {/* MODAL 1: ADD NEW DEVICE */}
      <AnimatePresence>
        {showAddHostModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/15 rounded-xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-white"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-bold text-sm text-purple-400 font-mono">➕ Add Device to Inventory</h3>
                <button onClick={() => setShowAddHostModal(false)} className="text-white/40 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleAddDevice} className="flex flex-col gap-3 text-xs">
                <div className="flex flex-col gap-1">
                  <label className="text-white/60">Host Alias / Name</label>
                  <input
                    type="text"
                    placeholder="e.g. webserver-01, node-db"
                    value={newHostAlias}
                    onChange={(e) => setNewHostAlias(e.target.value)}
                    required
                    className="bg-black/50 border border-white/15 rounded px-3 py-2 font-mono focus:border-purple-500 outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-white/60">IP Address / FQDN</label>
                  <input
                    type="text"
                    placeholder="e.g. 192.168.1.50 or 127.0.0.1"
                    value={newHostIp}
                    onChange={(e) => setNewHostIp(e.target.value)}
                    required
                    className="bg-black/50 border border-white/15 rounded px-3 py-2 font-mono focus:border-purple-500 outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-white/60">Operating System</label>
                  <select
                    value={newHostOs}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewHostOs(val);
                      if (newHostGroup === 'linux_hosts' || newHostGroup === 'windows_hosts') {
                        setNewHostGroup(val === 'Windows' ? 'windows_hosts' : 'linux_hosts');
                      }
                    }}
                    className="bg-black/50 border border-white/15 rounded px-3 py-2 font-mono focus:border-purple-500 outline-none text-white"
                  >
                    <option value="Linux">Linux</option>
                    <option value="Windows">Windows</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-white/60">MAC Address (Optional, for auto IP tracking)</label>
                  <input
                    type="text"
                    placeholder="e.g. 00:1A:2B:3C:4D:5E"
                    value={newHostMac}
                    onChange={(e) => setNewHostMac(e.target.value)}
                    className="bg-black/50 border border-white/15 rounded px-3 py-2 font-mono focus:border-purple-500 outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-white/60">Target Ansible Group(s) (comma or semicolon separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. linux_hosts, webservers, database"
                    value={newHostGroup}
                    onChange={(e) => setNewHostGroup(e.target.value)}
                    className="bg-black/50 border border-white/15 rounded px-3 py-2 font-mono focus:border-purple-500 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowAddHostModal(false)}
                    className="px-4 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                  >
                    Save to Inventory
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: ASSIGN GROUP */}
      <AnimatePresence>
        {showAssignGroupModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/15 rounded-xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3 text-white"
            >
              <h3 className="font-bold text-sm text-purple-400 font-mono">
                Assign <span className="text-white">{showAssignGroupModal}</span> to Group(s)
              </h3>

              <div className="flex flex-col gap-1 text-xs">
                <label className="text-white/60">Ansible Group Name(s) (comma or semicolon separated):</label>
                <input
                  type="text"
                  placeholder="e.g. webservers, database, staging"
                  value={targetGroupInput}
                  onChange={(e) => setTargetGroupInput(e.target.value)}
                  className="bg-black/50 border border-white/15 rounded px-3 py-2 font-mono focus:border-purple-500 outline-none text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAssignGroupModal(null)}
                  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAssignToGroup(showAssignGroupModal)}
                  className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-xs text-white font-semibold"
                >
                  Assign Group(s)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: SPECS VIEWER */}
      <AnimatePresence>
        {selectedHostSpecs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/15 rounded-xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🖥️</span>
                  <div>
                    <h3 className="font-bold text-sm text-purple-400 font-mono">{selectedHostSpecs.host}</h3>
                    <p className="text-[11px] text-white/40">Ansible Hardware Profile</p>
                  </div>
                </div>
                <button onClick={() => setSelectedHostSpecs(null)} className="text-white/40 hover:text-white">✕</button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-black/30 p-2.5 rounded border border-white/5 flex flex-col gap-0.5">
                  <span className="text-white/40 text-[10px]">IPv4 Address</span>
                  <span className="font-mono text-emerald-400 font-semibold">{selectedHostSpecs.ip}</span>
                </div>
                <div className="bg-black/30 p-2.5 rounded border border-white/5 flex flex-col gap-0.5">
                  <span className="text-white/40 text-[10px]">Architecture</span>
                  <span className="font-mono text-purple-300 font-semibold">{selectedHostSpecs.arch}</span>
                </div>
                <div className="bg-black/30 p-2.5 rounded border border-white/5 flex flex-col gap-0.5">
                  <span className="text-white/40 text-[10px]">OS Distribution</span>
                  <span className="text-white/90">{selectedHostSpecs.os}</span>
                </div>
                <div className="bg-black/30 p-2.5 rounded border border-white/5 flex flex-col gap-0.5">
                  <span className="text-white/40 text-[10px]">Kernel Release</span>
                  <span className="font-mono text-white/70 truncate">{selectedHostSpecs.kernel}</span>
                </div>
                <div className="bg-black/30 p-2.5 rounded border border-white/5 flex flex-col gap-0.5">
                  <span className="text-white/40 text-[10px]">Compute Cores</span>
                  <span className="font-mono text-amber-400 font-semibold">{selectedHostSpecs.cpuCores} vCPUs</span>
                </div>
                <div className="bg-black/30 p-2.5 rounded border border-white/5 flex flex-col gap-0.5">
                  <span className="text-white/40 text-[10px]">Total System RAM</span>
                  <span className="font-mono text-blue-400 font-semibold">{selectedHostSpecs.totalRam}</span>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-white/10">
                <button
                  onClick={() => setSelectedHostSpecs(null)}
                  className="px-4 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs font-medium text-white"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}