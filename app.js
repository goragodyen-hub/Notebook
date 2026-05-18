/**
 * Kiosk Dashboard Application
 * Fetches data from Google Sheets CSV export and renders a real-time dashboard.
 */

// URL from the user: "https://docs.google.com/spreadsheets/d/1HLZrbQWCaO_DngdbLmA87yklixChyjj1aK3FbbjksXU/edit?usp=sharing"
// Export link for CSV:
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1HLZrbQWCaO_DngdbLmA87yklixChyjj1aK3FbbjksXU/gviz/tq?tqx=out:csv&sheet=SessionLogs";

// State
let machinesData = new Map(); // Key: machineName, Value: latestLogObj
let recentLogs = [];
let currentFilter = 'all';

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
    const sidebar = document.querySelector('.sidebar');
    
    if (btnMenu && sidebar) {
        btnMenu.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
}

function fetchData() {
    lastUpdateEl.textContent = "Fetching...";
    
    // Add a cache-buster to ensure we get fresh data
    const url = `${SHEET_CSV_URL}&_cb=${new Date().getTime()}`;
    
    Papa.parse(url, {
        download: true,
        header: false, // We'll handle columns manually since header might be inconsistent
        skipEmptyLines: true,
        complete: function(results) {
            processData(results.data);
            loadingState.style.display = 'none';
        },
        error: function(error) {
            console.error("Error fetching data:", error);
            lastUpdateEl.textContent = "Error fetching data";
            // In a real app, maybe show a toast notification here
        }
    });
}

function processData(rows) {
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
        
        const log = {
            time: row[0] || '',
            user: row[1] || 'Unknown',
            machineName: finalMachineName,
            machineId: row[3] || '',
            action: row[4] || '',
            status: row[5] || '',
            detail: row[6] || ''
        };
        
        if (log.machineName) {
            machinesData.set(log.machineName, log);
        }
    }
    
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

function getStatusInfo(action) {
    const act = action.toLowerCase();
    if (act.includes('login')) {
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
        const statusInfo = getStatusInfo(data.action);
        
        // Filter logic
        if (currentFilter === 'in-use' && statusInfo.text !== 'In Use') return;
        if (currentFilter === 'available' && statusInfo.text !== 'Available') return;
        
        const clone = document.importNode(template, true);
        const card = clone.querySelector('.machine-card');
        
        // Apply status classes
        if (statusInfo.class) {
            card.classList.add(statusInfo.class);
        }
        
        clone.querySelector('.machine-name').textContent = data.machineName;
        clone.querySelector('.status-badge').textContent = statusInfo.text;
        
        // Always show the username (last known user or current user)
        clone.querySelector('.user-name').textContent = data.user;
        
        clone.querySelector('.last-action-time').textContent = data.time;
        clone.querySelector('.action-detail').textContent = data.detail || 'No details provided';
        clone.querySelector('.action-type').textContent = `Last Action: ${data.action}`;
        
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
        const statusInfo = getStatusInfo(data.action);
        if (statusInfo.text === 'In Use') activeCount++;
    });
    
    totalMachinesEl.textContent = machinesData.size;
    activeMachinesEl.textContent = activeCount;
}

// Start app
init();
