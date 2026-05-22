/**
 * Kiosk Dashboard Application
 * Fetches data from Google Sheets CSV export and renders a real-time dashboard.
 */

// URL from the user: "https://docs.google.com/spreadsheets/d/1HLZrbQWCaO_DngdbLmA87yklixChyjj1aK3FbbjksXU/edit?usp=sharing"
// Export link for CSV:
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1HLZrbQWCaO_DngdbLmA87yklixChyjj1aK3FbbjksXU/gviz/tq?tqx=out:csv&sheet=SessionLogs";
const DEVICES_CSV_URL = "https://docs.google.com/spreadsheets/d/1HLZrbQWCaO_DngdbLmA87yklixChyjj1aK3FbbjksXU/gviz/tq?tqx=out:csv&sheet=Devices";
const LOG_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwTHEnz86gbbqxqkuHfb2PV5m_JkboLwzPYfcV5YW1m_DHTWNnNZBQNcpLfkhZsEwZVdQ/exec";

// State
let machinesData = new Map(); // Key: machineName, Value: latestLogObj
let recentLogs = [];
let currentFilter = 'all';
let totalUsageData = new Map(); // Key: machineName, Value: total usage days
var consecutiveUsageData = new Map(); // Key: machineName, Value: {user, days}
// DOM Elements
const loadingState = document.getElementById('loading-state');
const machinesGrid = document.getElementById('machines-grid');
const activityFeed = document.getElementById('activity-feed');
const totalMachinesEl = document.getElementById('total-machines');
const activeMachinesEl = document.getElementById('active-machines');
const lastUpdateEl = document.getElementById('last-update');
const btnRefresh = document.getElementById('force-refresh-btn');
const filterBtns = document.querySelectorAll('.filter-btn');

// Initialize
function init() {
    setupEventListeners();
    fetchData();
    // Auto refresh every 30 seconds
    setInterval(fetchData, 30000);
}

function setupEventListeners() {
    btnRefresh.addEventListener('click', fetchData);
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderGrid();
        });
    });

    // Hamburger Menu Toggle
    const btnMenu = document.getElementById('menu-toggle-btn');
    const btnCloseSidebar = document.getElementById('close-sidebar-btn');
    const sidebar = document.querySelector('.sidebar');
    
    if (btnMenu && sidebar) {
        btnMenu.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
    
    if (btnCloseSidebar && sidebar) {
        btnCloseSidebar.addEventListener('click', () => {
            sidebar.classList.remove('open');
        });
    }
}

function fetchData() {
    lastUpdateEl.textContent = "Fetching...";
    
    const cb = new Date().getTime();
    const sessionLogsUrl = `${SHEET_CSV_URL}&_cb=${cb}`;
    const devicesUrl = `${DEVICES_CSV_URL}&_cb=${cb}`;
    
    // Fetch Devices status first to get the heartbeats (Last Seen)
    Papa.parse(devicesUrl, {
        download: true,
        header: false,
        skipEmptyLines: true,
        complete: function(devicesResults) {
            const devicesHeartbeats = new Map();
            const rows = devicesResults.data;
            let start = 0;
            
            if (rows.length > 0 && rows[0][0].toLowerCase().includes('device')) {
                start = 1;
            }
            
            for (let i = start; i < rows.length; i++) {
                const row = rows[i];
                if (row.length >= 6) {
                    const devId = row[0].trim().toUpperCase();
                    const lastSeenTime = row[5];
                    devicesHeartbeats.set(devId, lastSeenTime);
                }
            }
            
            // Now parse SessionLogs
            Papa.parse(sessionLogsUrl, {
                download: true,
                header: false,
                skipEmptyLines: true,
                complete: function(results) {
                    processData(results.data, devicesHeartbeats);
                    loadingState.style.display = 'none';
                },
                error: function(error) {
                    console.error("Error fetching session logs:", error);
                    lastUpdateEl.textContent = "Error fetching data";
                }
            });
        },
        error: function(error) {
            console.error("Error fetching devices data:", error);
            // Fallback to SessionLogs only if Devices sheet fails
            Papa.parse(sessionLogsUrl, {
                download: true,
                header: false,
                skipEmptyLines: true,
                complete: function(results) {
                    processData(results.data, new Map());
                    loadingState.style.display = 'none';
                },
                error: function(error) {
                    console.error("Error fetching session logs:", error);
                    lastUpdateEl.textContent = "Error fetching data";
                }
            });
        }
    });
}

function parseSheetDate(dateStr) {
    if (!dateStr) return null;
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    
    // Handle dd/mm/yyyy hh:mm:ss
    const parts = dateStr.split(/[\s/:]+/);
    if (parts.length >= 6) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);
        if (year > 2400) year -= 543; // Convert Buddhist Era to Gregorian
        
        const hour = parseInt(parts[3], 10);
        const min = parseInt(parts[4], 10);
        const sec = parseInt(parts[5], 10);
        
        d = new Date(year, month, day, hour, min, sec);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

function isDeviceOnline(lastSeenStr) {
    if (!lastSeenStr) return false;
    const lastSeenDate = parseSheetDate(lastSeenStr);
    if (!lastSeenDate) return false;
    
    const now = new Date();
    const diffSec = (now - lastSeenDate) / 1000;
    return diffSec < 150; // Online if polled in the last 2.5 minutes
}

function processData(rows, devicesHeartbeats = new Map()) {
    if (!rows || rows.length === 0) return;
    
    machinesData.clear();
    
    // Build device mapping from columns J (index 9) and K (index 10)
    const deviceMap = new Map();
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const serial = row[9];
        const mappedName = row[10];
        if (serial && mappedName) {
            deviceMap.set(serial.trim().toUpperCase(), mappedName.trim());
        }
    }
    
    // User requested to ignore test data before row 102 (index 101 in array)
    // However, if the sheet is cleared later and has fewer than 101 rows, we should still read it.
    let startIndex = (rows[0][0] && rows[0][0].toLowerCase() === 'time') ? 1 : 0;
    
    // If the total rows are more than 101, it means the old test data is still there, so we skip to row 102.
    // (Row 102 in Google Sheet is index 101 in our array)
    if (rows.length > 101) {
        startIndex = 101;
    }
    
    // Process from oldest to newest to keep the latest status in Map
    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 5) continue; // Skip malformed rows
        
        let rawMachineName = row[2] || 'Unknown-PC';
        
        // Auto-translate serial to friendly name if it exists in the map
        let finalMachineName = rawMachineName;
        const lookupKey = rawMachineName.trim().toUpperCase();
        if (deviceMap.has(lookupKey)) {
            finalMachineName = deviceMap.get(lookupKey);
        }
        
        const lastSeenTime = devicesHeartbeats.get(rawMachineName.trim().toUpperCase()) || '';
        const online = isDeviceOnline(lastSeenTime);
        
        const log = {
            time: row[0] || '',
            user: row[1] || 'Unknown',
            machineName: finalMachineName,
            machineId: row[3] || '',
            deviceId: rawMachineName, // Store the raw Computer Name (e.g. TRUE-35)
            action: row[4] || '',
            status: row[5] || '',
            detail: row[6] || '',
            online: online
        };
        
        if (log.machineName) {
            machinesData.set(log.machineName, log);
        }
    }
    
    // Calculate consecutive usage days per machine+user
    calculateConsecutiveUsage(rows, startIndex, deviceMap);
    
    // Get recent logs for the feed (reverse order, max 20)
    recentLogs = [];
    for (let i = rows.length - 1; i >= startIndex; i--) {
        if (recentLogs.length >= 20) break;
        const row = rows[i];
        if (row.length < 5) continue;
        
        let rawMachineName = row[2] || 'Unknown-PC';
        let finalMachineName = rawMachineName;
        const lookupKey = rawMachineName.trim().toUpperCase();
        if (deviceMap.has(lookupKey)) {
            finalMachineName = deviceMap.get(lookupKey);
        }
        
        recentLogs.push({
            time: row[0] || '',
            user: row[1] || 'Unknown',
            machineName: finalMachineName,
            action: row[4] || '',
            detail: row[6] || ''
        });
    }
    
    renderDashboard();
    
    const now = new Date();
    lastUpdateEl.textContent = `Updated: ${now.toLocaleTimeString()}`;
}

function renderDashboard() {
    renderGrid();
    renderFeed();
    updateStats();
}

function getStatusInfo(action, user) {
    const act = action.toLowerCase();
    if (user === 'goragod.yen' && act.includes('login')) {
        return { text: 'Admin Warning', class: 'status-alarm' };
    } else if (act.includes('login')) {
        return { text: 'In Use', class: 'status-in-use' };
    } else if (act.includes('alert') || act.includes('alarm')) {
        return { text: 'Alarm', class: 'status-alarm' };
    } else {
        return { text: 'Available', class: '' };
    }
}

function renderGrid() {
    machinesGrid.innerHTML = '';
    const template = document.getElementById('machine-card-template').content;
    
    // Sort machines by name
    const sortedMachines = Array.from(machinesData.values()).sort((a, b) => 
        a.machineName.localeCompare(b.machineName)
    );
    
    sortedMachines.forEach(data => {
        const statusInfo = getStatusInfo(data.action, data.user);
        
        // Filter logic
        if (currentFilter === 'in-use' && statusInfo.text !== 'In Use' && statusInfo.text !== 'Admin Warning') return;
        if (currentFilter === 'available' && statusInfo.text !== 'Available') return;
        
        const clone = document.importNode(template, true);
        const card = clone.querySelector('.machine-card');
        
        // Apply status classes
        if (statusInfo.class) {
            card.classList.add(statusInfo.class);
        }
        // Add click listener to show consecutive usage alert if available
        card.addEventListener('click', () => {
            const usageInfo = consecutiveUsageData.get(data.machineName);
            if (usageInfo) {
                // Show an alert with usage days
                alert(`${usageInfo.user} ใช้เครื่อง ${data.machineName} ติดต่อกัน ${usageInfo.days} วัน`);
            } else {
                alert(`ไม่มีข้อมูลการใช้งานต่อเนื่องสำหรับ ${data.machineName}`);
            }
        });
        
        const nameEl = clone.querySelector('.machine-name');
        if (nameEl) {
            nameEl.innerHTML = `${data.machineName} <span class="heartbeat-dot ${data.online ? 'online' : 'offline'}" title="${data.online ? 'Online' : 'Offline'}"></span>`;
        }
        clone.querySelector('.status-badge').textContent = statusInfo.text;
        
        // Always show the username (last known user or current user)
        clone.querySelector('.user-name').textContent = data.user;
        
        clone.querySelector('.last-action-time').textContent = data.time;
        clone.querySelector('.action-detail').textContent = data.detail || 'No details provided';
        clone.querySelector('.action-type').textContent = `Last Action: ${data.action}`;
        
        // Show consecutive usage warning if > 1 day
        const usageInfo = consecutiveUsageData.get(data.machineName);
        if (usageInfo && usageInfo.days > 1) {
            const warningEl = document.createElement('div');
            warningEl.className = 'consecutive-usage-warning';
            warningEl.innerHTML = `
                <i class="fa-solid fa-fire"></i>
                <span><strong>${usageInfo.user}</strong> ใช้เครื่องนี้ติดต่อกัน <strong>${usageInfo.days} วัน</strong></span>
            `;
            card.querySelector('.card-body').appendChild(warningEl);
        }
        
        // Setup clear session button
        const btnClear = clone.querySelector('.btn-card-clear');
        if (btnClear) {
            if (statusInfo.text === 'In Use' || statusInfo.text === 'Admin Warning') {
                btnClear.style.display = 'inline-flex';
                btnClear.addEventListener('click', (e) => {
                    e.stopPropagation();
                    clearSession(data.deviceId, data.machineName, data.user);
                });
            } else {
                btnClear.style.display = 'none';
            }
        }
        
        // Setup remote shutdown button
        const btnShutdown = clone.querySelector('.btn-card-shutdown');
        if (btnShutdown) {
            if (statusInfo.text === 'In Use' || statusInfo.text === 'Admin Warning' || data.online) {
                btnShutdown.style.display = 'inline-flex';
                btnShutdown.addEventListener('click', (e) => {
                    e.stopPropagation();
                    shutdownMachine(data.deviceId, data.machineName);
                });
            } else {
                btnShutdown.style.display = 'none';
            }
        }
        
        machinesGrid.appendChild(clone);
    });
}

function renderFeed() {
    activityFeed.innerHTML = '';
    
    recentLogs.forEach(log => {
        const el = document.createElement('div');
        el.className = 'log-item';
        
        // Determine icon based on action
        let iconClass = 'fa-solid fa-desktop log-icon';
        const act = log.action.toLowerCase();
        
        if (act.includes('login')) iconClass = 'fa-solid fa-right-to-bracket log-icon login';
        else if (act.includes('logout')) iconClass = 'fa-solid fa-right-from-bracket log-icon logout';
        else if (act.includes('timeout')) iconClass = 'fa-solid fa-hourglass-end log-icon timeout';
        else if (act.includes('alert') || act.includes('alarm')) iconClass = 'fa-solid fa-triangle-exclamation log-icon alarm';
        
        el.innerHTML = `
            <div class="${iconClass}"></div>
            <div class="log-content">
                <span class="log-time">${log.time}</span>
                <span class="log-title"><strong>${log.user}</strong> | ${log.action}</span>
                <span class="log-detail">${log.machineName} - ${log.detail}</span>
            </div>
        `;
        
        activityFeed.appendChild(el);
    });
}

function updateStats() {
    let activeCount = 0;
    machinesData.forEach(data => {
        const statusInfo = getStatusInfo(data.action, data.user);
        if (statusInfo.text === 'In Use' || statusInfo.text === 'Admin Warning') activeCount++;
    });
    
    totalMachinesEl.textContent = machinesData.size;
    activeMachinesEl.textContent = activeCount;
}

function shutdownMachine(deviceId, machineName) {
    if (!deviceId || deviceId.toUpperCase() === 'UNKNOWN' || deviceId.toUpperCase() === 'SYSTEM') {
        showToast("ไม่สามารถสั่ง Shutdown อุปกรณ์ระบุตัวตนไม่ได้ครับ", "error");
        return;
    }
    
    showCustomConfirm(
        "🚨 ยืนยันการสั่ง Shutdown",
        `ต้องการสั่ง Shutdown เครื่อง <strong>"${machineName}"</strong> (${deviceId}) ระยะไกลใช่หรือไม่?<br><br><span style="font-size: 0.8rem; color: var(--status-alarm);">เครื่องคอมพิวเตอร์ปลายทางจะปิดตัวลงทันทีที่มีการเชื่อมต่อข้อมูลครับ (ภายใน 60 วินาที)</span>`,
        true, // isDanger theme
        () => {
            const url = `${LOG_SCRIPT_URL}?action=set_command&targetId=${deviceId}&command=shutdown`;
            
            fetch(url, { mode: 'no-cors' })
                .then(() => {
                    showToast(`ส่งคำสั่ง Shutdown ไปยังเครื่อง "${machineName}" เรียบร้อยแล้ว!`, "success");
                    setTimeout(() => {
                        fetchData();
                    }, 800);
                })
                .catch(error => {
                    console.error("Error setting shutdown command:", error);
                    showToast("เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อส่งคำสั่ง", "error");
                });
        }
    );
}

function clearSession(deviceId, machineName, username) {
    if (!deviceId || deviceId.toUpperCase() === 'UNKNOWN' || deviceId.toUpperCase() === 'SYSTEM') {
        showToast("ไม่สามารถสั่ง Clear Session อุปกรณ์ระบุตัวตนไม่ได้ครับ", "error");
        return;
    }
    
    showCustomConfirm(
        "🔄 ยืนยัน Clear Session",
        `ยืนยันการสั่ง Clear Session (Force Logout) เครื่อง <strong>"${machineName}"</strong> (${deviceId}) หรือไม่?<br><br>การดำเนินการนี้จะเปลี่ยนสถานะเครื่องบนบอร์ดเป็น Available และบันทึกประวัติ Logout ลง Google Sheets`,
        false, // normal warning theme
        () => {
            const url = `${LOG_SCRIPT_URL}?deviceId=${encodeURIComponent(deviceId)}&username=${encodeURIComponent(username)}&action=Logout&status=OK&detail=Force+logout+by+Admin`;
            
            fetch(url, { mode: 'no-cors' })
                .then(() => {
                    showToast(`สั่ง Clear Session เครื่อง "${machineName}" สำเร็จ!`, "success");
                    setTimeout(() => {
                        fetchData(); // Refresh page data
                    }, 800);
                })
                .catch(error => {
                    console.error("Error clearing session:", error);
                    showToast("เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อ Clear Session", "error");
                });
        }
    );
}

// Custom Non-blocking Dialog Handlers
function showCustomConfirm(title, message, isDanger, onConfirm) {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const btnCancel = document.getElementById('modal-btn-cancel');
    const btnConfirm = document.getElementById('modal-btn-confirm');
    const icon = modal.querySelector('.modal-icon');
    
    modalTitle.textContent = title;
    modalMessage.innerHTML = message;
    
    // Set theme (Danger vs Warning)
    if (isDanger) {
        icon.className = 'fa-solid fa-triangle-exclamation modal-icon danger';
        btnConfirm.className = 'btn-modal-confirm danger';
    } else {
        icon.className = 'fa-solid fa-circle-question modal-icon';
        btnConfirm.className = 'btn-modal-confirm';
    }
    
    // Show modal
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
    
    // Handlers
    const close = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 300);
    };
    
    btnCancel.onclick = () => {
        close();
    };
    
    btnConfirm.onclick = () => {
        close();
        onConfirm();
    };
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconClass = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark';
    toast.innerHTML = `
        <i class="${iconClass} toast-icon"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove toast after 3.5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/**
 * Calculate how many consecutive days (including today) the current user
 * of each machine has been logging in on that same machine.
 * Only Login actions are counted. We look at distinct calendar dates.
 */
function calculateConsecutiveUsage(rows, startIndex, deviceMap) {
    consecutiveUsageData.clear();
    
    // Build a map: machineName -> { user -> Set of date strings }
    const machineUserDates = new Map();
    
    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 5) continue;
        
        const action = (row[4] || '').toLowerCase();
        if (!action.includes('login')) continue;
        
        const timeStr = row[0] || '';
        const user = row[1] || 'Unknown';
        let rawMachineName = row[2] || 'Unknown-PC';
        let finalMachineName = rawMachineName;
        const lookupKey = rawMachineName.trim().toUpperCase();
        if (deviceMap.has(lookupKey)) {
            finalMachineName = deviceMap.get(lookupKey);
        }
        
        const parsedDate = parseSheetDate(timeStr);
        if (!parsedDate) continue;
        
        // Create a date-only string (YYYY-MM-DD) for grouping by day
        const dateKey = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
        
        if (!machineUserDates.has(finalMachineName)) {
            machineUserDates.set(finalMachineName, new Map());
        }
        const userMap = machineUserDates.get(finalMachineName);
        if (!userMap.has(user)) {
            userMap.set(user, new Set());
        }
        userMap.get(user).add(dateKey);
    }
    
    // For each machine, find the current user (from machinesData) and check their streak
    machinesData.forEach((data, machineName) => {
        const statusInfo = getStatusInfo(data.action, data.user);
        // Only care about machines currently in use
        if (statusInfo.text !== 'In Use' && statusInfo.text !== 'Admin Warning') return;
        
        const userMap = machineUserDates.get(machineName);
        if (!userMap) return;
        
        const currentUser = data.user;
        const dates = userMap.get(currentUser);
        if (!dates || dates.size === 0) return;
        
        // Sort dates descending
        const sortedDates = Array.from(dates).sort().reverse();
        

        // Calculate total usage days (unique dates across all users for this machine)
        const userMaps = machineUserDates.get(machineName);
        if (userMaps) {
            const allDates = new Set();
            userMaps.forEach(dateSet => {
                dateSet.forEach(d => allDates.add(d));
            });
            totalUsageData.set(machineName, { days: allDates.size });
        }
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        // Start from today or the most recent date in the data
        let startDate;
        let consecutiveDays = 1;
        if (sortedDates[0] === todayKey) {
            startDate = today;
        } else {
            // Use the most recent date
            startDate = new Date(sortedDates[0] + 'T00:00:00');
        }
        
        // Walk backwards from the start date
        for (let d = 1; d < sortedDates.length; d++) {
            const prevDay = new Date(startDate);
            prevDay.setDate(prevDay.getDate() - d);
            const prevKey = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`;
            
            if (dates.has(prevKey)) {
                consecutiveDays++;
            } else {
                break;
            }
        }
        
            if (consecutiveDays > 1) {
                consecutiveUsageData.set(machineName, {
                    user: currentUser,
                    days: consecutiveDays
                });
                if (typeof showToast === 'function') {
                    showToast(`⚠️ ${currentUser} ใช้เครื่อง ${machineName} ติดต่อกัน ${consecutiveDays} วัน`, 'warning');
                }
            }
    });
}

// Start app
init();
