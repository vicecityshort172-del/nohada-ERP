// =============================================================================
// NOHADA TRADING PLC - ERP FRONTEND CLIENT LOGIC
// Matches Wise Digital Garage System UI Specification 1:1
// =============================================================================

const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? ''
  : '';

let currentJobs = [];
let activeCockpitJob = null;
let currentTabFilter = 'all';

// Jobs Pagination State
let jobsCurrentPage = 1;
let jobsPageSize = 5;
let filteredJobsList = [];

// CPO Registry State & Pagination
let currentCpos = [];
let currentCpoBankFilter = 'ALL';
let currentCpoStatusFilter = 'ALL';
let cpoCurrentPage = 1;
let cpoPageSize = 5;
let cpoSearchTerm = '';
let cpoFilterBank = 'ALL';
let cpoFilterStatus = 'ALL';
let cpoFilterType = 'ALL';
let filteredCposList = [];

// Cockpit Internal Pagination
let cockpitDepositsPage = 1;
let cockpitDepositsPageSize = 5;
let cockpitExpensesPage = 1;
let cockpitExpensesPageSize = 5;

// Reusable Pagination Controls Renderer
function renderPaginationControls(containerId, currentPage, totalPages, onPageClickFnName) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (totalPages <= 1) {
    const p1 = document.createElement('button');
    p1.className = 'pagination-btn active';
    p1.textContent = '1';
    container.appendChild(p1);
    return;
  }

  // Prev Button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'pagination-btn';
  prevBtn.innerHTML = '&lsaquo; Prev';
  prevBtn.disabled = currentPage <= 1;
  prevBtn.onclick = () => window[onPageClickFnName](currentPage - 1);
  container.appendChild(prevBtn);

  // Page numbers logic
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  if (startPage > 1) {
    const firstBtn = document.createElement('button');
    firstBtn.className = 'pagination-btn';
    firstBtn.textContent = '1';
    firstBtn.onclick = () => window[onPageClickFnName](1);
    container.appendChild(firstBtn);
    if (startPage > 2) {
      const dots = document.createElement('span');
      dots.className = 'px-1 text-slate-400 font-bold';
      dots.textContent = '...';
      container.appendChild(dots);
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
    pageBtn.textContent = i;
    pageBtn.onclick = () => window[onPageClickFnName](i);
    container.appendChild(pageBtn);
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const dots = document.createElement('span');
      dots.className = 'px-1 text-slate-400 font-bold';
      dots.textContent = '...';
      container.appendChild(dots);
    }
    const lastBtn = document.createElement('button');
    lastBtn.className = 'pagination-btn';
    lastBtn.textContent = totalPages;
    lastBtn.onclick = () => window[onPageClickFnName](totalPages);
    container.appendChild(lastBtn);
  }

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'pagination-btn';
  nextBtn.innerHTML = 'Next &rsaquo;';
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.onclick = () => window[onPageClickFnName](currentPage + 1);
  container.appendChild(nextBtn);
}

// Re-run lucide icons on updates
function refreshIcons() {
  if (window.lucide) {
    setTimeout(() => lucide.createIcons(), 50);
  }
}

// -----------------------------------------------------------------------------
// 1. DASHBOARD & STATS LOADER
// -----------------------------------------------------------------------------
async function loadDashboardData() {
  try {
    // Fetch system KPIs
    const statsRes = await fetch('/api/stats');
    if (statsRes.ok) {
      const stats = await statsRes.json();
      document.getElementById('kpiActiveFiles').textContent = stats.activeJobFiles || 7;
      document.getElementById('kpiActiveSub').textContent = stats.activeCount || 5;
      document.getElementById('kpiClearedSub').textContent = stats.clearedCount || 2;
      
      const cpoMillions = ((stats.totalCpoGuarantees || 3450000) / 1000000).toFixed(2);
      document.getElementById('kpiCpoTotal').innerHTML = `${cpoMillions}M <span class="text-xs font-bold">ETB</span>`;
      document.getElementById('kpiCpoHeld').textContent = stats.cpoHeldCount || 5;
      document.getElementById('kpiCpoReturned').textContent = stats.cpoReturnedCount || 2;

      if (document.getElementById('cpoHeldCardCount')) {
        document.getElementById('cpoHeldCardCount').textContent = `${stats.cpoHeldCount || 5} Held Guarantees`;
      }
      if (document.getElementById('cpoReturnedCardCount')) {
        document.getElementById('cpoReturnedCardCount').textContent = `${stats.cpoReturnedCount || 2} Returned`;
      }

      document.getElementById('kpiTransitTotal').textContent = stats.containersInTransit || 18;
      document.getElementById('kpiTotalDisbursed').textContent = `ETB ${Number(stats.totalDisbursed || 801000).toLocaleString()}`;
    }

    // Fetch jobs table data
    await loadJobsTable();
  } catch (err) {
    console.error('Error loading dashboard data:', err);
  }
}

// -----------------------------------------------------------------------------
// 2. JOBS TABLE LOADER & RENDERER
// -----------------------------------------------------------------------------
async function loadJobsTable(query = '') {
  try {
    const res = await fetch(`/api/jobs${query}`);
    if (res.ok) {
      currentJobs = await res.json();
      renderJobsTable(currentJobs);
      renderDashboardRecentJobs(currentJobs.slice(0, 5));
    }
  } catch (err) {
    console.error('Error fetching jobs:', err);
  }
}

function renderDashboardRecentJobs(jobs) {
  const tbody = document.getElementById('dashboardRecentJobsBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  jobs.forEach(job => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 hover:bg-slate-50/80 transition-colors';

    let statusBadge = '<span class="badge-pill badge-held">IN TRANSIT</span>';
    if (job.status === 'Cleared') {
      statusBadge = '<span class="badge-pill badge-cleared">CLEARED</span>';
    } else if (job.status === 'Customs Check') {
      statusBadge = '<span class="badge-pill badge-credit">CUSTOMS CHECK</span>';
    } else if (job.status === 'Doc Missing') {
      statusBadge = '<span class="badge-pill badge-due">DOC MISSING</span>';
    } else if (job.status === 'At Djibouti') {
      statusBadge = '<span class="badge-pill badge-held">AT DJIBOUTI</span>';
    }

    tr.innerHTML = `
      <td>
        <span class="font-extrabold text-sky-800 text-xs tracking-tight cursor-pointer hover:underline" onclick="loadJobCockpit('${job.id}')">${job.fileRefNumber}</span>
      </td>
      <td>
        <div class="font-bold text-slate-900 text-xs">${job.consignee?.name || 'N/A'}</div>
        <div class="text-[10px] text-slate-500">${job.blNumber || ''}</div>
      </td>
      <td>
        <span class="font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">${job.operationPort}</span>
      </td>
      <td>
        <span class="font-mono text-xs text-slate-800">${job.containerNumber || 'N/A'}</span>
      </td>
      <td>${statusBadge}</td>
      <td class="text-center">
        <button onclick="loadJobCockpit('${job.id}')" class="bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 mx-auto transition">
          <i data-lucide="eye" class="w-3 h-3"></i>
          <span>Cockpit</span>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  refreshIcons();
}

function setJobsPage(pageNum) {
  jobsCurrentPage = pageNum;
  renderJobsTable(currentJobs);
}

function changeJobsPageSize(newSize) {
  jobsPageSize = newSize;
  jobsCurrentPage = 1;
  renderJobsTable(currentJobs);
}

function renderJobsTable(jobs) {
  const tbody = document.getElementById('jobsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = jobs;
  if (currentTabFilter === 'active') {
    filtered = jobs.filter(j => j.status !== 'Cleared');
  } else if (currentTabFilter === 'cleared') {
    filtered = jobs.filter(j => j.status === 'Cleared');
  }

  // Quick search filter
  const searchVal = (document.getElementById('tableQuickSearch')?.value || '').toLowerCase().trim();
  if (searchVal) {
    filtered = filtered.filter(j =>
      (j.fileRefNumber || '').toLowerCase().includes(searchVal) ||
      (j.consignee?.name || '').toLowerCase().includes(searchVal) ||
      (j.blNumber || '').toLowerCase().includes(searchVal) ||
      (j.containerNumber || '').toLowerCase().includes(searchVal) ||
      (j.operationPort || '').toLowerCase().includes(searchVal)
    );
  }

  filteredJobsList = filtered;
  const total = filtered.length;
  const pageSize = jobsPageSize === 'ALL' ? total || 1 : Number(jobsPageSize);
  const totalPages = Math.ceil(total / pageSize) || 1;
  if (jobsCurrentPage > totalPages) jobsCurrentPage = totalPages;
  if (jobsCurrentPage < 1) jobsCurrentPage = 1;

  const startIndex = (jobsCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageItems = filtered.slice(startIndex, endIndex);

  const countEl = document.getElementById('tableEntriesCount');
  if (countEl) {
    countEl.textContent = total > 0
      ? `Showing ${startIndex + 1} to ${endIndex} of ${total} entries`
      : 'Showing 0 of 0 entries';
  }

  renderPaginationControls('jobsPaginationControls', jobsCurrentPage, totalPages, 'setJobsPage');

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-slate-400 italic">No job files found matching your search.</td></tr>`;
    refreshIcons();
    return;
  }

  pageItems.forEach((job, index) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 hover:bg-slate-50/80 transition-colors';

    // Status Badge
    let statusBadge = '<span class="badge-pill badge-held">IN TRANSIT</span>';
    if (job.status === 'Cleared') {
      statusBadge = '<span class="badge-pill badge-cleared">CLEARED</span>';
    } else if (job.status === 'Customs Check') {
      statusBadge = '<span class="badge-pill badge-credit">CUSTOMS CHECK</span>';
    } else if (job.status === 'Doc Missing') {
      statusBadge = '<span class="badge-pill badge-due">DOC MISSING</span>';
    }

    // CPO Badge
    let cpoBadge = '<span class="badge-pill badge-held">HELD (BOA)</span>';
    if (job.cpoStatus === 'RETURNED') {
      cpoBadge = '<span class="badge-pill badge-paid">RETURNED</span>';
    }

    // Net Balance formatting
    const netBal = Number(job.netBalance || 0);
    const balanceColor = netBal < 0 ? 'text-red-600 font-bold' : netBal > 0 ? 'text-emerald-600 font-bold' : 'text-slate-500';
    const balanceText = `${netBal < 0 ? '' : '+'}${netBal.toLocaleString()} ETB`;

    tr.innerHTML = `
      <td class="text-center font-bold text-slate-400 text-xs">${startIndex + index + 1}</td>
      <td>
        <span class="font-extrabold text-sky-800 text-xs tracking-tight">${job.fileRefNumber}</span>
      </td>
      <td>
        <div class="font-bold text-slate-900 text-xs">${job.consignee?.name || 'N/A'}</div>
        <div class="text-[10px] text-slate-500">${job.consignee?.phone || ''} ${job.consignee?.tin ? '• TIN: ' + job.consignee.tin : ''}</div>
      </td>
      <td><span class="font-mono text-xs text-slate-700">${job.blNumber}</span></td>
      <td><span class="font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">${job.operationPort}</span></td>
      <td>
        <div class="text-xs font-semibold text-slate-800">${job.containerNumber}</div>
        <div class="text-[10px] text-slate-400">${job.containerType || ''}</div>
      </td>
      <td><span class="text-xs text-slate-600">${(job.assignedStaff || '').split(' ')[0]}</span></td>
      <td>${statusBadge}</td>
      <td>${cpoBadge}</td>
      <td class="text-right ${balanceColor} text-xs tabular-nums">${balanceText}</td>
      <td class="text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="loadJobCockpit('${job.id}')" class="btn-card-action" title="Open Master Cockpit">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            <span>Cockpit</span>
          </button>
          <button onclick="openPrintStatementForJob('${job.id}')" class="btn-icon-edit" title="Print Statement">
            <i data-lucide="printer" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="deleteJob('${job.id}')" class="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition" title="Delete File">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  refreshIcons();
}

// -----------------------------------------------------------------------------
// 3. MASTER JOB COCKPIT (ABM00240/26 - Bilal Sadik Focus)
// -----------------------------------------------------------------------------
async function loadJobCockpit(jobId = 'ABM00240-26') {
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) throw new Error('Failed to fetch job detail');

    const job = await res.json();
    activeCockpitJob = job;

    // Switch view
    switchView('cockpit');

    // Update sidebar cockpit label
    const cockpitLabel = document.getElementById('sidebarCockpitText');
    if (cockpitLabel && job) {
      cockpitLabel.textContent = `Cockpit (${job.fileRefNumber})`;
    }

    // Populate Blue Jacket header
    document.getElementById('cockpitFileRefBadge').textContent = job.fileRefNumber;
    document.getElementById('cockpitRefNumber').textContent = job.fileRefNumber;
    document.getElementById('cockpitStatusBadge').textContent = job.status.toUpperCase();
    document.getElementById('cockpitConsigneeName').textContent = job.consignee?.name || 'BILAL SADIK YASIN';
    document.getElementById('cockpitTin').textContent = job.consignee?.tin || '0107735519';
    document.getElementById('cockpitPhone').textContent = job.consignee?.phone || '0951448385';
    document.getElementById('cockpitStaff').textContent = job.assignedStaff || 'Imran (0911525317)';
    document.getElementById('cockpitPort').textContent = `${job.operationPort} (Mojo Dry Port)`;
    document.getElementById('cockpitBlNumber').textContent = job.blNumber;
    document.getElementById('cockpitContainer').textContent = `${job.containerNumber} (${job.containerType || "20GP"})`;
    document.getElementById('cockpitCustomsTax').textContent = `${(job.declaration?.taxBreakdown?.totalTaxPaid || 268010.72).toLocaleString()} ETB`;
    document.getElementById('cockpitDecNo').textContent = job.declaration?.decNumber || '4-25530/2026';

    // Populate Financial Summary cards
    const summary = job.financialSummary || {};
    document.getElementById('sumOperatingDeposit').textContent = `${Number(summary.totalOperatingCash || 200000).toLocaleString()}.00 ETB`;
    document.getElementById('sumTotalExpenses').textContent = `${Number(summary.totalExpenses || 203000).toLocaleString()}.00 ETB`;
    
    const netBal = Number(summary.netBalance || -3000);
    document.getElementById('sumNetBalance').textContent = `${netBal < 0 ? '' : '+'}${netBal.toLocaleString()}.00 ETB`;
    document.getElementById('cockpitBalanceStatus').textContent = netBal < 0 ? 'CLIENT OWES NOHADA' : netBal > 0 ? 'REFUND DUE' : 'SETTLED';

    // Populate Deposits & CPO Guarantees sub-table
    renderCockpitDeposits(job.deposits || []);

    // Populate Itemized Expenses sub-table
    renderCockpitExpenses(job.expenses || []);

    // Populate 10-Point Document Checklist
    renderCockpitDocuments(job.documents || []);

    // Populate Dynamic Interactive 7-Stage Stepper
    renderCockpitStepper(job);

    // Populate Dynamic Customs Assessment & Tax Breakdown
    renderCockpitTaxAssessment(job);

    refreshIcons();
  } catch (err) {
    console.error('Error loading cockpit:', err);
  }
}

function setCockpitDepositsPage(pageNum) {
  cockpitDepositsPage = pageNum;
  if (activeCockpitJob) renderCockpitDeposits(activeCockpitJob.deposits || []);
}

function renderCockpitDeposits(deposits) {
  const tbody = document.getElementById('cockpitDepositsTable');
  if (!tbody) return;
  tbody.innerHTML = '';

  const total = deposits.length;
  const pageSize = cockpitDepositsPageSize;
  const totalPages = Math.ceil(total / pageSize) || 1;
  if (cockpitDepositsPage > totalPages) cockpitDepositsPage = totalPages;
  if (cockpitDepositsPage < 1) cockpitDepositsPage = 1;

  const startIndex = (cockpitDepositsPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageItems = deposits.slice(startIndex, endIndex);

  const countEl = document.getElementById('cockpitDepositsEntriesCount');
  if (countEl) {
    countEl.textContent = total > 0
      ? `Showing ${startIndex + 1} to ${endIndex} of ${total} deposits`
      : 'Showing 0 of 0 deposits';
  }

  renderPaginationControls('cockpitDepositsPaginationControls', cockpitDepositsPage, totalPages, 'setCockpitDepositsPage');

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 italic">No deposit or CPO records for this file.</td></tr>`;
    refreshIcons();
    return;
  }

  pageItems.forEach((dep) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100';

    const isHeld = dep.status === 'HELD';
    const statusBadge = isHeld
      ? '<span class="badge-pill badge-held">🟡 HELD AT BANK</span>'
      : '<span class="badge-pill badge-paid">🟢 RETURNED TO CLIENT</span>';

    const actionBtn = isHeld && dep.category === 'GUARANTEE_CPO'
      ? `<button onclick="openReturnCpoModal('${dep.id}', ${dep.amount}, '${dep.bank}')" class="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-2.5 py-1 rounded shadow-xs flex items-center gap-1 mx-auto">
          <i data-lucide="corner-up-left" class="w-3 h-3"></i>
          <span>Return CPO</span>
        </button>`
      : `<span class="text-[11px] text-slate-400 font-semibold">Settled</span>`;

    const returnDetails = dep.returnedTo
      ? `<div class="text-[11px] text-emerald-800 font-bold">To: ${dep.returnedTo}</div>
         <div class="text-[10px] text-slate-500">Date: ${dep.returnDate || ''}</div>`
      : `<span class="text-[11px] text-slate-400 italic">Held in Vault</span>`;

    tr.innerHTML = `
      <td class="font-semibold text-slate-700 text-xs">${dep.date}</td>
      <td><span class="font-bold text-xs ${dep.category === 'GUARANTEE_CPO' ? 'text-amber-800' : 'text-sky-800'}">${dep.type}</span></td>
      <td><span class="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-xs font-semibold">${dep.bank}</span></td>
      <td class="font-black text-slate-900 text-xs tabular-nums">${Number(dep.amount).toLocaleString()}.00 ETB</td>
      <td><span class="text-xs text-slate-600">${dep.purpose || ''}</span></td>
      <td>${statusBadge}</td>
      <td>${returnDetails}</td>
      <td class="text-center">${actionBtn}</td>
    `;
    tbody.appendChild(tr);
  });

  refreshIcons();
}

function setCockpitExpensesPage(pageNum) {
  cockpitExpensesPage = pageNum;
  if (activeCockpitJob) renderCockpitExpenses(activeCockpitJob.expenses || []);
}

function renderCockpitExpenses(expenses) {
  const tbody = document.getElementById('cockpitExpensesTable');
  if (!tbody) return;
  tbody.innerHTML = '';

  const total = expenses.length;
  const pageSize = cockpitExpensesPageSize;
  const totalPages = Math.ceil(total / pageSize) || 1;
  if (cockpitExpensesPage > totalPages) cockpitExpensesPage = totalPages;
  if (cockpitExpensesPage < 1) cockpitExpensesPage = 1;

  const startIndex = (cockpitExpensesPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageItems = expenses.slice(startIndex, endIndex);

  const countEl = document.getElementById('cockpitExpensesEntriesCount');
  if (countEl) {
    countEl.textContent = total > 0
      ? `Showing ${startIndex + 1} to ${endIndex} of ${total} expenses`
      : 'Showing 0 of 0 expenses';
  }

  renderPaginationControls('cockpitExpensesPaginationControls', cockpitExpensesPage, totalPages, 'setCockpitExpensesPage');

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 italic">No disbursed expenses recorded for this file.</td></tr>`;
    refreshIcons();
    return;
  }

  pageItems.forEach((exp) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100';

    tr.innerHTML = `
      <td class="font-semibold text-slate-700 text-xs">${exp.date}</td>
      <td><span class="bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded text-xs font-bold">${exp.category}</span></td>
      <td><span class="text-xs text-slate-800 font-medium">${exp.description}</span></td>
      <td class="font-black text-rose-700 text-xs tabular-nums">${Number(exp.amount).toLocaleString()}.00 ETB</td>
      <td><span class="text-xs text-slate-600 font-medium">${exp.paidTo || ''}</span></td>
      <td><span class="font-mono text-[11px] text-slate-500">${exp.receiptNo || '-'}</span></td>
    `;
    tbody.appendChild(tr);
  });

  refreshIcons();
}

function renderCockpitDocuments(docs) {
  const container = document.getElementById('documentsChecklistContainer');
  container.innerHTML = '';

  docs.forEach((doc) => {
    const isVerified = doc.status === 'verified';
    const card = document.createElement('div');
    card.className = `p-3 rounded-lg border flex items-center justify-between ${
      isVerified ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'
    }`;

    card.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-7 h-7 rounded flex items-center justify-center font-black text-xs ${
          isVerified ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
        }">
          ${doc.code}
        </div>
        <div>
          <div class="font-bold text-xs text-slate-900">${doc.name}</div>
          <div class="text-[10px] text-slate-500">${doc.ref || 'Pending Verification'}</div>
        </div>
      </div>
      <div class="text-right flex items-center gap-2">
        ${
          isVerified
            ? `<span class="text-emerald-700 font-bold text-xs flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i> Verified</span>
               <button onclick="toggleDocumentStatus('${doc.code}')" class="text-[10px] text-slate-400 hover:text-slate-600 underline ml-2">Uncheck</button>`
            : `<button onclick="toggleDocumentStatus('${doc.code}')" class="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-2.5 py-1 rounded shadow-xs flex items-center gap-1">
                 <i data-lucide="upload" class="w-3 h-3"></i>
                 <span>Verify / Upload</span>
               </button>`
        }
      </div>
    `;
    container.appendChild(card);
  });
}

// -----------------------------------------------------------------------------
// 3b. INTERACTIVE 7-STAGE PIPELINE ENGINE
// -----------------------------------------------------------------------------
const STAGES_CONFIG = [
  { step: 1, title: '1. Doc Received', getSub: j => (j.documents ? `${j.documents.filter(d=>d.status==='verified').length}/10 Docs` : 'Verified') },
  { step: 2, title: '2. At Djibouti', getSub: j => (j.vesselName ? j.vesselName.split(' ')[0] + ' ' + (j.vesselName.split(' ')[1] || '') : 'Discharged') },
  { step: 3, title: '3. Mojo Transit', getSub: j => `${j.operationPort || 'MOJ'} Dry Port` },
  { step: 4, title: '4. eCMS Declared', getSub: j => (j.declaration?.decNumber ? j.declaration.decNumber : 'Dec Pending') },
  { step: 5, title: '5. Tax Paid', getSub: j => (j.declaration?.taxBreakdown?.totalTaxPaid ? `${Number(j.declaration.taxBreakdown.totalTaxPaid).toLocaleString()} ETB` : 'Assessing') },
  { step: 6, title: '6. Cargo Cleared', getSub: j => (j.status === 'Cleared' ? 'Released Mojo' : 'Inspection') },
  { step: 7, title: '7. Interchange', getSub: j => (j.cpoStatus === 'RETURNED' ? 'CPO Returned' : 'Box In-Hand') }
];

function renderCockpitStepper(job) {
  const container = document.getElementById('cockpitStepperContainer');
  if (!container || !job) return;
  container.innerHTML = '';

  const currentStep = Number(job.statusStep) || (job.status === 'Cleared' ? 6 : 2);
  const badge = document.getElementById('cockpitCurrentStageBadge');
  if (badge) {
    const activeCfg = STAGES_CONFIG[currentStep - 1] || STAGES_CONFIG[1];
    badge.textContent = `Stage ${currentStep}: ${activeCfg.title.split('. ')[1]}`;
  }

  STAGES_CONFIG.forEach((cfg) => {
    const isCompleted = cfg.step < currentStep;
    const isCurrent = cfg.step === currentStep;
    const isPending = cfg.step > currentStep;

    const div = document.createElement('div');
    div.className = `p-2.5 rounded-lg border text-center cursor-pointer transition-all duration-150 select-none hover:shadow-xs ${
      isCurrent
        ? 'border-sky-500 bg-sky-50 text-sky-950 ring-2 ring-sky-400 font-bold'
        : isCompleted
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
    }`;
    div.onclick = () => setCockpitStage(cfg.step);
    div.title = `Click to set progress to Stage ${cfg.step}: ${cfg.title}`;

    const iconHtml = isCompleted
      ? '<div class="stepper-circle bg-emerald-600 text-white mx-auto mb-1.5 text-xs font-bold">✓</div>'
      : isCurrent
      ? `<div class="stepper-circle bg-sky-600 text-white mx-auto mb-1.5 text-xs font-bold ring-2 ring-sky-300">${cfg.step}</div>`
      : `<div class="stepper-circle bg-slate-300 text-slate-700 mx-auto mb-1.5 text-xs font-bold">${cfg.step}</div>`;

    const subColor = isCurrent ? 'text-sky-700 font-bold' : isCompleted ? 'text-emerald-700' : 'text-slate-400';

    div.innerHTML = `
      ${iconHtml}
      <div class="font-bold text-[11px] leading-tight truncate">${cfg.title}</div>
      <div class="text-[10px] ${subColor} mt-0.5 truncate">${cfg.getSub(job)}</div>
    `;

    container.appendChild(div);
  });
}

async function setCockpitStage(stageNum) {
  if (!activeCockpitJob) return;
  try {
    const res = await fetch(`/api/jobs/${activeCockpitJob.id}/stage`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: stageNum })
    });
    if (res.ok) {
      const data = await res.json();
      activeCockpitJob.statusStep = stageNum;
      activeCockpitJob.status = data.job.status;
      renderCockpitStepper(activeCockpitJob);
      const statusBadge = document.getElementById('cockpitStatusBadge');
      if (statusBadge) statusBadge.textContent = activeCockpitJob.status.toUpperCase();
      await loadDashboardData();
    }
  } catch (e) {
    console.error('Error updating stage:', e);
  }
}

async function advanceCockpitStage() {
  if (!activeCockpitJob) return;
  const currentStep = Number(activeCockpitJob.statusStep) || 2;
  if (currentStep >= 7) {
    alert('This job file is already at the final stage (Interchange / Closed).');
    return;
  }
  await setCockpitStage(currentStep + 1);
}

// -----------------------------------------------------------------------------
// 3c. CUSTOMS ASSESSMENT NOTICE & TAX ESTIMATOR INTEGRATION
// -----------------------------------------------------------------------------
function renderCockpitTaxAssessment(job) {
  if (!job) return;
  const dec = job.declaration || {};
  const tax = dec.taxBreakdown || {};

  // Headers
  const decEl = document.getElementById('assessmentDecNo');
  if (decEl) decEl.textContent = dec.decNumber || 'Pending Dec';

  const rcpEl = document.getElementById('assessmentReceiptNo');
  if (rcpEl) rcpEl.textContent = tax.receiptNo || 'Pending';

  const modeEl = document.getElementById('assessmentMode');
  if (modeEl) modeEl.textContent = tax.mode || 'CASH';

  const badgeEl = document.getElementById('assessmentStatusBadge');
  if (badgeEl) {
    const isPaid = (job.statusStep >= 5 || job.status === 'Cleared');
    badgeEl.className = isPaid ? 'badge-pill badge-paid' : 'badge-pill badge-held';
    badgeEl.textContent = isPaid ? 'PAID IN FULL' : 'ASSESSMENT PENDING';
  }

  // Row values
  const duty = Number(tax.importDuty || (job.id === 'ABM00240-26' ? 114552.90 : 0));
  const excise = Number(tax.exciseTax || (job.id === 'ABM00240-26' ? 20987.75 : 0));
  const surtax = Number(tax.surtax || (job.id === 'ABM00240-26' ? 46283.40 : 0));
  const social = Number(tax.socialWelfareTax || 0);
  const vat = Number(tax.vat || (job.id === 'ABM00240-26' ? 76367.85 : 0));
  const wht = Number(tax.withholdingTax || (job.id === 'ABM00240-26' ? 9818.82 : 0));
  const total = Number(tax.totalTaxPaid || (duty + excise + surtax + social + vat + wht));

  if (document.getElementById('taxNoticeImport')) document.getElementById('taxNoticeImport').textContent = duty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (document.getElementById('taxNoticeExcise')) document.getElementById('taxNoticeExcise').textContent = excise.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (document.getElementById('taxNoticeSurtax')) document.getElementById('taxNoticeSurtax').textContent = surtax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (document.getElementById('taxNoticeSocial')) document.getElementById('taxNoticeSocial').textContent = social.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (document.getElementById('taxNoticeVat')) document.getElementById('taxNoticeVat').textContent = vat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (document.getElementById('taxNoticeWht')) document.getElementById('taxNoticeWht').textContent = wht.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (document.getElementById('taxNoticeTotal')) document.getElementById('taxNoticeTotal').textContent = `${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

  // Blue jacket header tax total sync
  const headerTax = document.getElementById('cockpitCustomsTax');
  if (headerTax) headerTax.textContent = `${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;
}

function openEditAssessmentModal() {
  if (!activeCockpitJob) return;
  const dec = activeCockpitJob.declaration || {};
  const tax = dec.taxBreakdown || {};

  document.getElementById('editDecNumber').value = dec.decNumber || '4-25530/2026';
  document.getElementById('editReceiptNo').value = tax.receiptNo || 'MOJ00-R-59983';
  document.getElementById('editPaymentMode').value = tax.mode || 'CASH';
  document.getElementById('editDuty').value = tax.importDuty || (activeCockpitJob.id === 'ABM00240-26' ? 114552.90 : 0);
  document.getElementById('editExcise').value = tax.exciseTax || (activeCockpitJob.id === 'ABM00240-26' ? 20987.75 : 0);
  document.getElementById('editSurtax').value = tax.surtax || (activeCockpitJob.id === 'ABM00240-26' ? 46283.40 : 0);
  document.getElementById('editSocialWelfare').value = tax.socialWelfareTax || 0;
  document.getElementById('editVat').value = tax.vat || (activeCockpitJob.id === 'ABM00240-26' ? 76367.85 : 0);
  document.getElementById('editWithholding').value = tax.withholdingTax || (activeCockpitJob.id === 'ABM00240-26' ? 9818.82 : 0);

  document.getElementById('modalEditAssessment').classList.remove('hidden');
}

function calculateModalAssessmentTotal() {
  const duty = Number(document.getElementById('editDuty').value) || 0;
  const excise = Number(document.getElementById('editExcise').value) || 0;
  const surtax = Number(document.getElementById('editSurtax').value) || 0;
  const social = Number(document.getElementById('editSocialWelfare').value) || 0;
  const vat = Number(document.getElementById('editVat').value) || 0;
  const wht = Number(document.getElementById('editWithholding').value) || 0;
  const sum = duty + excise + surtax + social + vat + wht;
  alert(`Calculated Total Customs Tax: ${sum.toLocaleString()} ETB`);
  return sum;
}

async function submitAssessmentUpdate() {
  if (!activeCockpitJob) return;
  const decNumber = document.getElementById('editDecNumber').value.trim();
  const receiptNo = document.getElementById('editReceiptNo').value.trim();
  const mode = document.getElementById('editPaymentMode').value;
  const duty = Number(document.getElementById('editDuty').value) || 0;
  const excise = Number(document.getElementById('editExcise').value) || 0;
  const surtax = Number(document.getElementById('editSurtax').value) || 0;
  const socialWelfare = Number(document.getElementById('editSocialWelfare').value) || 0;
  const vat = Number(document.getElementById('editVat').value) || 0;
  const withholding = Number(document.getElementById('editWithholding').value) || 0;
  const totalTaxPaid = duty + excise + surtax + socialWelfare + vat + withholding;

  try {
    const res = await fetch(`/api/jobs/${activeCockpitJob.id}/tax-assessment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decNumber, receiptNo, mode, duty, excise, surtax, socialWelfare, vat, withholding, totalTaxPaid })
    });
    if (res.ok) {
      const data = await res.json();
      activeCockpitJob.declaration = data.declaration;
      closeModal('modalEditAssessment');
      renderCockpitTaxAssessment(activeCockpitJob);
      renderCockpitStepper(activeCockpitJob);
      alert('✅ Customs Assessment Notice updated successfully!');
    }
  } catch (e) {
    console.error('Error saving tax assessment:', e);
  }
}

// Import values from Customs Tax Estimator (TAX.xlsx) into this job!
async function importFromTaxEstimatorToCockpit() {
  if (!activeCockpitJob) return;
  if (!confirm(`Import calculated tax breakdown from the Tax Estimator into file ${activeCockpitJob.fileRefNumber}?`)) return;

  // Read calculated values from the active tax estimation calculator
  const duty = Number((document.getElementById('taxGrandDuty')?.textContent || '0').replace(/,/g, '')) || 0;
  const excise = Number((document.getElementById('taxGrandExcise')?.textContent || '0').replace(/,/g, '')) || 0;
  const surtax = Number((document.getElementById('taxGrandSurtax')?.textContent || '0').replace(/,/g, '')) || 0;
  const vat = Number((document.getElementById('taxGrandVat')?.textContent || '0').replace(/,/g, '')) || 0;
  const withholding = Number((document.getElementById('taxGrandWht')?.textContent || '0').replace(/,/g, '')) || 0;
  const totalTaxPaid = duty + excise + surtax + vat + withholding;

  try {
    const res = await fetch(`/api/jobs/${activeCockpitJob.id}/tax-assessment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decNumber: activeCockpitJob.declaration?.decNumber || `DEC-${activeCockpitJob.blNumber}`,
        receiptNo: 'ESTIMATOR-CALC',
        mode: 'Telebirr / e-Payment',
        duty, excise, surtax, socialWelfare: 0, vat, withholding, totalTaxPaid
      })
    });
    if (res.ok) {
      const data = await res.json();
      activeCockpitJob.declaration = data.declaration;
      renderCockpitTaxAssessment(activeCockpitJob);
      renderCockpitStepper(activeCockpitJob);
      alert(`✅ Successfully imported ${totalTaxPaid.toLocaleString()} ETB estimated tax into ${activeCockpitJob.fileRefNumber}!`);
    }
  } catch (e) {
    console.error('Error importing tax:', e);
  }
}

// -----------------------------------------------------------------------------
// 4. CPO RETURN ACTION (HELD -> RETURNED)
// -----------------------------------------------------------------------------
let selectedDepositId = null;

function openReturnCpoModal(depositId, amount, bank) {
  selectedDepositId = depositId;
  document.getElementById('returnModalAmount').textContent = `${Number(amount).toLocaleString()}.00 ETB`;
  document.getElementById('returnModalBank').textContent = bank;
  document.getElementById('returnDateInput').value = new Date().toISOString().split('T')[0];
  document.getElementById('returnPersonInput').value = 'Yeshak (Customer Representative)';
  document.getElementById('returnRemarksInput').value = 'Interchange empty return document verified from Djibouti; guarantee released.';
  
  document.getElementById('modalReturnCpo').classList.remove('hidden');
}

async function confirmReturnCpo() {
  const returnedTo = document.getElementById('returnPersonInput').value;
  const returnDate = document.getElementById('returnDateInput').value;
  const remarks = document.getElementById('returnRemarksInput').value;

  if (!returnedTo) {
    alert('Please enter who the CPO was returned to.');
    return;
  }

  try {
    const res = await fetch(`/api/cpo/return/${selectedDepositId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnedTo, returnDate, remarks })
    });

    if (res.ok) {
      closeModal('modalReturnCpo');
      alert(`✅ CPO Guarantee successfully recorded as RETURNED to ${returnedTo}!`);
      // Reload current job cockpit and dashboard
      if (activeCockpitJob) {
        await loadJobCockpit(activeCockpitJob.id);
      }
      await loadDashboardData();
      await loadCpoTable();
    } else {
      alert('Failed to update CPO status.');
    }
  } catch (err) {
    console.error('Error confirming CPO return:', err);
  }
}

// -----------------------------------------------------------------------------
// 5. ADD DISBURSED EXPENSE
// -----------------------------------------------------------------------------
function openExpenseModal() {
  document.getElementById('expenseAmountInput').value = '';
  document.getElementById('expenseDescriptionInput').value = '';
  document.getElementById('expensePaidToInput').value = '';
  document.getElementById('modalAddExpense').classList.remove('hidden');
}

async function submitNewExpense() {
  const category = document.getElementById('expenseCategoryInput').value;
  const description = document.getElementById('expenseDescriptionInput').value;
  const amount = document.getElementById('expenseAmountInput').value;
  const paidTo = document.getElementById('expensePaidToInput').value;

  if (!description || !amount || Number(amount) <= 0) {
    alert('Please provide a valid description and amount.');
    return;
  }

  const jobId = activeCockpitJob ? activeCockpitJob.id : 'ABM00240-26';

  try {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, category, description, amount, paidTo })
    });

    if (res.ok) {
      closeModal('modalAddExpense');
      alert('✅ Job Expense successfully added! Net balance automatically updated.');
      if (activeCockpitJob) {
        await loadJobCockpit(activeCockpitJob.id);
      }
      await loadDashboardData();
    }
  } catch (err) {
    console.error('Error adding expense:', err);
  }
}

// -----------------------------------------------------------------------------
// 6. ADD DEPOSIT / CPO
// -----------------------------------------------------------------------------
function openDepositModal() {
  document.getElementById('depositAmountInput').value = '';
  document.getElementById('depositPurposeInput').value = '';
  const bankOther = document.getElementById('depositBankOtherInput');
  if (bankOther) {
    bankOther.value = '';
    bankOther.classList.add('hidden');
  }
  document.getElementById('depositBankInput').value = 'Bank of Abyssinia (BOA)';
  document.getElementById('modalAddDeposit').classList.remove('hidden');
}

async function submitNewDeposit() {
  const category = document.getElementById('depositCategoryInput').value;
  const type = document.getElementById('depositTypeInput').value;
  let bank = document.getElementById('depositBankInput').value;
  if (bank === 'Other') {
    const customBank = (document.getElementById('depositBankOtherInput')?.value || '').trim();
    if (!customBank) {
      alert('Please enter the custom bank name.');
      return;
    }
    bank = customBank;
  }
  const amount = document.getElementById('depositAmountInput').value;
  const purpose = document.getElementById('depositPurposeInput').value;

  if (!amount || Number(amount) <= 0) {
    alert('Please provide a valid deposit amount.');
    return;
  }

  const jobId = activeCockpitJob ? activeCockpitJob.id : 'ABM00240-26';

  try {
    const res = await fetch('/api/cpo/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, category, type, bank, amount, purpose })
    });

    if (res.ok) {
      closeModal('modalAddDeposit');
      alert('✅ Client Deposit / CPO successfully registered!');
      if (activeCockpitJob) {
        await loadJobCockpit(activeCockpitJob.id);
      }
      await loadDashboardData();
    }
  } catch (err) {
    console.error('Error adding deposit:', err);
  }
}

// -----------------------------------------------------------------------------
// 7. TAX ESTIMATION CALCULATOR (TAX.xlsx DIGITAL TWIN)
// -----------------------------------------------------------------------------
let taxItems = [
  { id: 1, description: 'MEN TRACK JACKET', qty: 600, unitPriceUsd: 7.22, fobUsd: 4332.00, freightEtb: 33704.57, insuranceEtb: 35.20, otherEtb: 9929.54 },
  { id: 2, description: 'MEN JACKET', qty: 5530, unitPriceUsd: 9.03, fobUsd: 49935.90, freightEtb: 388519.95, insuranceEtb: 405.78, otherEtb: 114459.98 },
  { id: 3, description: 'MEN VEST', qty: 420, unitPriceUsd: 6.52, fobUsd: 2738.40, freightEtb: 21305.77, insuranceEtb: 22.25, otherEtb: 6276.79 },
  { id: 4, description: 'MEN PANT', qty: 1500, unitPriceUsd: 5.89, fobUsd: 8835.00, freightEtb: 68739.60, insuranceEtb: 71.79, otherEtb: 20251.04 },
  { id: 5, description: 'MEN SOCKS', qty: 1500, unitPriceUsd: 5.33, fobUsd: 7995.00, freightEtb: 62204.08, insuranceEtb: 64.96, otherEtb: 18325.64 }
];

async function initTaxEstimatorTable() {
  await recalculateTaxTable();
}

async function recalculateTaxTable() {
  const rateInput = document.getElementById('taxExchangeRate');
  const rate = rateInput ? Number(rateInput.value) || 125.50 : 125.50;

  try {
    const res = await fetch('/api/tax/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exchangeRate: rate, items: taxItems })
    });

    if (res.ok) {
      const data = await res.json();
      renderTaxSpreadsheet(data.items, data.totals);
    }
  } catch (err) {
    console.error('Error recalculating tax:', err);
  }
}

function openAddCargoModal() {
  document.getElementById('cargoDescInput').value = '';
  document.getElementById('cargoQtyInput').value = '1000';
  document.getElementById('cargoUnitPriceInput').value = '10.00';
  document.getElementById('cargoFreightInput').value = '50000';
  document.getElementById('cargoInsuranceInput').value = '50';
  document.getElementById('cargoOtherInput').value = '15000';
  document.getElementById('modalAddCargo').classList.remove('hidden');
}

function submitNewCargoItem() {
  const desc = document.getElementById('cargoDescInput').value.trim();
  const qty = Number(document.getElementById('cargoQtyInput').value) || 1;
  const unitPriceUsd = Number(document.getElementById('cargoUnitPriceInput').value) || 0;
  const freightEtb = Number(document.getElementById('cargoFreightInput').value) || 0;
  const insuranceEtb = Number(document.getElementById('cargoInsuranceInput').value) || 0;
  const otherEtb = Number(document.getElementById('cargoOtherInput').value) || 0;

  if (!desc) {
    alert('Please enter cargo description.');
    return;
  }

  const newItem = {
    id: Date.now(),
    description: desc.toUpperCase(),
    qty,
    unitPriceUsd,
    fobUsd: qty * unitPriceUsd,
    freightEtb,
    insuranceEtb,
    otherEtb
  };

  taxItems.push(newItem);
  closeModal('modalAddCargo');
  recalculateTaxTable();
}

function deleteTaxItem(itemId) {
  if (taxItems.length <= 1) {
    alert('At least one cargo item must remain.');
    return;
  }
  taxItems = taxItems.filter(item => item.id !== itemId);
  recalculateTaxTable();
}

function renderTaxSpreadsheet(items, totals) {
  const tbody = document.getElementById('taxTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  items.forEach((item) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 hover:bg-slate-50';

    tr.innerHTML = `
      <td class="font-bold text-slate-800">${item.description}</td>
      <td class="text-right tabular-nums">${item.qty.toLocaleString()}</td>
      <td class="text-right tabular-nums">$${item.unitPriceUsd.toFixed(2)}</td>
      <td class="text-right tabular-nums font-semibold">$${item.fobUsd.toLocaleString()}</td>
      <td class="text-right tabular-nums">${item.freightEtb.toLocaleString()}</td>
      <td class="text-right tabular-nums">${item.insuranceEtb.toFixed(2)}</td>
      <td class="text-right tabular-nums">${item.otherEtb.toLocaleString()}</td>
      <td class="text-right tabular-nums font-black bg-sky-50/70 text-sky-900">${item.dpvEtb.toLocaleString()}</td>
      <td class="text-right tabular-nums">${item.dutyEtb.toLocaleString()}</td>
      <td class="text-right tabular-nums">${item.exciseEtb.toLocaleString()}</td>
      <td class="text-right tabular-nums">${item.surtaxEtb.toLocaleString()}</td>
      <td class="text-right tabular-nums">${item.vatEtb.toLocaleString()}</td>
      <td class="text-right tabular-nums">${item.whtEtb.toLocaleString()}</td>
      <td class="text-right tabular-nums font-black bg-amber-50 text-amber-900">${item.totalTaxEtb.toLocaleString()} ETB</td>
      <td class="text-center">
        <button onclick="deleteTaxItem(${item.id})" class="text-rose-500 hover:text-rose-700 font-bold text-xs" title="Remove Cargo Row">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (totals) {
    document.getElementById('taxGrandDpv').textContent = totals.totalDpvEtb.toLocaleString();
    document.getElementById('taxGrandDuty').textContent = totals.totalDutyEtb.toLocaleString();
    document.getElementById('taxGrandExcise').textContent = totals.totalExciseEtb.toLocaleString();
    document.getElementById('taxGrandSurtax').textContent = totals.totalSurtaxEtb.toLocaleString();
    document.getElementById('taxGrandVat').textContent = totals.totalVatEtb.toLocaleString();
    document.getElementById('taxGrandWht').textContent = totals.totalWhtEtb.toLocaleString();
    document.getElementById('taxGrandTotal').textContent = `${totals.grandTotalTaxEtb.toLocaleString()} ETB`;
  }
}

// -----------------------------------------------------------------------------
// 8. PRINT OFFICIAL STATEMENT / INVOICE MODAL
// -----------------------------------------------------------------------------
// Helper to convert number to words (English words matching Image 2)
function numberToWords(amount) {
  const num = Math.round(Math.abs(Number(amount) || 0));
  if (num === 0) return 'Zero birr';

  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
    if (n < 1000000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 1000000000) return inWords(Math.floor(n / 1000000)) + ' Million' + (n % 1000000 !== 0 ? ' ' + inWords(n % 1000000) : '');
    return n.toString();
  }

  const words = inWords(num);
  return (amount < 0 ? 'Minus ' : '') + words.trim() + ' birr';
}

function openPrintStatementModal() {
  const job = activeCockpitJob;
  if (!job) return;

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // Header Meta
  document.getElementById('stmtDate').textContent = dateStr;
  const cleanRef = (job.fileRefNumber || '38702').replace(/[^a-zA-Z0-9]/g, '');
  document.getElementById('stmtFileRef').textContent = `PRF-${cleanRef}`;
  
  // Client & Shipment Meta
  document.getElementById('stmtClientName').textContent = job.consignee?.name || 'BILAL SADIK YASIN';
  document.getElementById('stmtBl').textContent = job.blNumber || 'ZSN0899042';
  document.getElementById('stmtContainer').textContent = `${job.containerNumber || 'TEMU3176663'} (${job.containerType || "20' GP"})`;
  
  const tinEl = document.getElementById('stmtClientTin');
  if (tinEl) tinEl.textContent = job.consignee?.tin || '0107735519';
  
  const portEl = document.getElementById('stmtPort');
  if (portEl) portEl.textContent = `${job.operationPort || 'MOJ'} (${job.operationPort === 'KAL' ? 'Kality' : 'Mojo'})`;

  const phoneEl = document.getElementById('stmtClientPhone');
  if (phoneEl) phoneEl.textContent = job.consignee?.phone || '0951448385';

  const freeDaysEl = document.getElementById('stmtFreeDays');
  if (freeDaysEl) freeDaysEl.textContent = `${job.freeDaysRemaining || 14} Days`;

  const staffEl = document.getElementById('stmtStaffName');
  if (staffEl) staffEl.textContent = (job.assignedStaff || 'Imran').split(' ')[0];

  // Table Body - Tabular Grid matching Image 2
  const tbody = document.getElementById('stmtReceiptTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totalExpenses = 0;
  let totalOperatingCash = 0;
  let serviceFee = 0;

  // 1. SECTION 1: OPERATIONAL EXPENSES & DISBURSEMENTS (Repair / Replace style in Image 2)
  const headerRow1 = document.createElement('tr');
  headerRow1.innerHTML = `<td colspan="8" class="receipt-section-header">Operational Disbursements & Port Freight (የተከፈሉ ወጪዎች)</td>`;
  tbody.appendChild(headerRow1);

  const expenses = job.expenses || [];
  if (expenses.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center">1</td>
      <td>Initial Port Terminal & Transit Processing Fee</td>
      <td class="text-center">Job</td>
      <td class="text-center">1</td>
      <td class="receipt-money-cell">0</td>
      <td class="text-center font-mono">00</td>
      <td class="receipt-money-cell">0</td>
      <td class="text-center font-mono">00</td>
    `;
    tbody.appendChild(tr);
  } else {
    expenses.forEach((exp, idx) => {
      const amt = Number(exp.amount) || 0;
      totalExpenses += amt;
      if ((exp.category || '').toLowerCase().includes('service')) serviceFee += amt;

      const unit = exp.category === 'Inland Transport' ? 'Trip' : exp.category === 'Port Terminal' ? 'Cont' : 'Job';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center font-bold">${idx + 1}</td>
        <td><span class="font-bold">${exp.category}:</span> ${exp.description} ${exp.paidTo ? '• ' + exp.paidTo : ''}</td>
        <td class="text-center">${unit}</td>
        <td class="text-center">1</td>
        <td class="receipt-money-cell">${amt.toLocaleString()}</td>
        <td class="text-center font-mono">00</td>
        <td class="receipt-money-cell font-bold">${amt.toLocaleString()}</td>
        <td class="text-center font-mono font-bold">00</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Disbursements Subtotal Row (Image 2 style)
  const expSubtotalRow = document.createElement('tr');
  expSubtotalRow.innerHTML = `
    <td colspan="6" class="text-right font-bold pr-2 bg-slate-50">Labour / Disbursements Cost (Subtotal)</td>
    <td class="receipt-money-cell font-bold text-slate-900 bg-slate-50">${totalExpenses.toLocaleString()}</td>
    <td class="text-center font-mono font-bold bg-slate-50">00</td>
  `;
  tbody.appendChild(expSubtotalRow);

  // 2. SECTION 2: CLIENT ADVANCE DEPOSITS & CPO GUARANTEES
  const headerRow2 = document.createElement('tr');
  headerRow2.innerHTML = `<td colspan="8" class="receipt-section-header">Client Deposits & Bank Guarantees (የተያዙ ማስያዣዎች)</td>`;
  tbody.appendChild(headerRow2);

  const deposits = job.deposits || [];
  let depCount = 0;
  deposits.forEach((dep) => {
    depCount++;
    const amt = Number(dep.amount) || 0;
    if (dep.category === 'OPERATIONAL_CASH') {
      totalOperatingCash += amt;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center font-bold">${depCount}</td>
        <td><span class="font-bold">Client Operational Cash Advance:</span> ${dep.bank} (${dep.purpose || 'Freight Advance'})</td>
        <td class="text-center">Cash</td>
        <td class="text-center">1</td>
        <td class="receipt-money-cell">${amt.toLocaleString()}</td>
        <td class="text-center font-mono">00</td>
        <td class="receipt-money-cell font-bold text-emerald-800">${amt.toLocaleString()}</td>
        <td class="text-center font-mono font-bold text-emerald-800">00</td>
      `;
      tbody.appendChild(tr);
    } else {
      // Guarantee CPO
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center font-bold">${depCount}</td>
        <td><span class="font-bold">Security CPO Guarantee:</span> ${dep.bank} • ${dep.purpose || 'Container Return Guarantee'} [${dep.status}]</td>
        <td class="text-center">CPO</td>
        <td class="text-center">1</td>
        <td class="receipt-money-cell">${amt.toLocaleString()}</td>
        <td class="text-center font-mono">00</td>
        <td class="receipt-money-cell font-bold text-amber-700">${dep.status === 'HELD' ? 'HELD' : 'RETURNED'}</td>
        <td class="text-center font-mono font-bold text-amber-700">-</td>
      `;
      tbody.appendChild(tr);
    }
  });

  if (depCount === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center">1</td>
      <td class="italic text-slate-500">No client advances or CPOs recorded</td>
      <td class="text-center">-</td>
      <td class="text-center">-</td>
      <td class="receipt-money-cell">0</td>
      <td class="text-center font-mono">00</td>
      <td class="receipt-money-cell">0</td>
      <td class="text-center font-mono">00</td>
    `;
    tbody.appendChild(tr);
  }

  // Advance Received Subtotal Row
  const cashSubtotalRow = document.createElement('tr');
  cashSubtotalRow.innerHTML = `
    <td colspan="6" class="text-right font-bold pr-2 bg-slate-50">Operational Advance Received (Subtotal)</td>
    <td class="receipt-money-cell font-bold text-emerald-800 bg-slate-50">${totalOperatingCash.toLocaleString()}</td>
    <td class="text-center font-mono font-bold text-emerald-800 bg-slate-50">00</td>
  `;
  tbody.appendChild(cashSubtotalRow);

  // 3. SUMMARY CALCULATION BLOCK (Exact Bottom Stack matching Image 2)
  const vatAmount = Math.round(serviceFee * 0.15);
  const grandTotal = totalExpenses;
  const netBalance = totalOperatingCash - grandTotal;

  const summaryRows = [
    { label: 'ድምር / Sub Total', val: totalExpenses, color: '' },
    { label: 'ተ.እ.ታ / VAT (15% on Agency Fee)', val: vatAmount, color: '' },
    { label: 'ጠቅላላ ወጪ / Grand Total', val: grandTotal, color: 'font-bold' },
    { label: 'የተከፈለ ጥሬ ገንዘብ / Fuel & Advance Received', val: totalOperatingCash, color: 'text-emerald-800 font-bold' },
    { label: netBalance < 0 ? 'የተጣራ ክፍያ / Net Balance Due Nohada' : 'የተጣራ ክፍያ / Refund Due Client', val: Math.abs(netBalance), color: netBalance < 0 ? 'text-rose-700 font-black' : 'text-emerald-700 font-black' }
  ];

  summaryRows.forEach(sr => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="6" class="text-right font-bold pr-3 ${sr.color}">${sr.label}</td>
      <td class="receipt-money-cell ${sr.color}">${sr.val.toLocaleString()}</td>
      <td class="text-center font-mono font-bold ${sr.color}">00</td>
    `;
    tbody.appendChild(tr);
  });

  // Amount In Words
  const wordsEl = document.getElementById('stmtAmountWords');
  if (wordsEl) {
    wordsEl.textContent = numberToWords(netBalance !== 0 ? netBalance : grandTotal);
  }

  document.getElementById('modalPrintStatement').classList.remove('hidden');
}
}

function openPrintStatementForJob(jobId) {
  loadJobCockpit(jobId).then(() => {
    openPrintStatementModal();
  });
}

// -----------------------------------------------------------------------------
// 9. RESPONSIVE MOBILE SIDEBAR & VIEW SWITCHING
// -----------------------------------------------------------------------------
function toggleMobileSidebar(open) {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('mobileSidebarBackdrop');
  if (!sidebar) return;

  if (open) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

function switchView(viewName) {
  // Auto-close mobile drawer on small devices
  if (window.innerWidth < 1024) {
    toggleMobileSidebar(false);
  }

  // Hide all 6 distinct views
  const views = ['dashboard', 'jobs', 'cpo', 'tax', 'cockpit', 'newjob'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add('hidden');
    const nav = document.getElementById(`nav-${v}`);
    if (nav) nav.classList.remove('active');
  });

  // Activate selected view
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.remove('hidden');

  const targetNav = document.getElementById(`nav-${viewName}`);
  if (targetNav) targetNav.classList.add('active');

  const breadcrumb = document.getElementById('breadcrumbCurrent');
  if (viewName === 'dashboard') {
    breadcrumb.textContent = 'Dashboard';
  } else if (viewName === 'jobs') {
    breadcrumb.textContent = 'Job Files Registry (Blue Jackets)';
    loadJobsTable();
  } else if (viewName === 'cpo') {
    breadcrumb.textContent = 'Multi-Bank CPO Guarantees Registry';
    loadCpoTable();
  } else if (viewName === 'tax') {
    breadcrumb.textContent = 'Customs Duty & Tax Estimator (TAX.xlsx)';
  } else if (viewName === 'cockpit') {
    breadcrumb.textContent = activeCockpitJob ? `File Cockpit (${activeCockpitJob.fileRefNumber})` : 'File Cockpit';
  } else if (viewName === 'newjob') {
    breadcrumb.textContent = 'Open New Blue File Jacket';
    resetNewJobForm();
  }

  refreshIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const mainScroll = document.querySelector('div.flex-1.overflow-y-auto');
  if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterByPortAndSwitch(port) {
  switchView('jobs');
  const portSelect = document.getElementById('filterPort');
  if (portSelect) portSelect.value = port;
  applyFilters();
}

// -----------------------------------------------------------------------------
// 9b. MULTI-BANK CPO REGISTRY (Excel Digital Twin)
// -----------------------------------------------------------------------------
async function loadCpoTable() {
  try {
    const res = await fetch('/api/cpo');
    if (res.ok) {
      currentCpos = await res.json();
      filterAndRenderCpos();
    }
  } catch (err) {
    console.error('Error fetching CPOs:', err);
  }
}

function handleCpoSearch(e) {
  cpoSearchTerm = (e.target.value || '').toLowerCase().trim();
  cpoCurrentPage = 1;
  filterAndRenderCpos();
}

function applyCpoDropdownFilters() {
  cpoFilterBank = document.getElementById('cpoFilterBankSelect')?.value || 'ALL';
  cpoFilterStatus = document.getElementById('cpoFilterStatusSelect')?.value || 'ALL';
  cpoFilterType = document.getElementById('cpoFilterTypeSelect')?.value || 'ALL';
  cpoCurrentPage = 1;
  filterAndRenderCpos();
}

function filterCpoByBank(bank) {
  cpoFilterBank = bank;
  const select = document.getElementById('cpoFilterBankSelect');
  if (select) select.value = bank;

  ['ALL', 'Abyssinia', 'Ethiopia', 'Awash', 'Abukii'].forEach(b => {
    const btn = document.getElementById(`cpo-bank-${b}`);
    if (btn) {
      btn.className = b === bank
        ? 'px-2.5 py-1 font-bold rounded bg-[#0284c7] text-white'
        : 'px-2.5 py-1 font-bold rounded text-slate-600 hover:bg-slate-200';
    }
  });

  cpoCurrentPage = 1;
  filterAndRenderCpos();
}

function filterCpoByStatus(status) {
  cpoFilterStatus = status;
  const select = document.getElementById('cpoFilterStatusSelect');
  if (select) select.value = status;

  ['ALL', 'HELD', 'RETURNED'].forEach(s => {
    const btn = document.getElementById(`cpo-status-${s}`);
    if (btn) {
      btn.className = s === status
        ? 'px-2.5 py-0.5 rounded bg-slate-800 text-white'
        : 'px-2.5 py-0.5 rounded text-slate-600 hover:bg-slate-100';
    }
  });

  cpoCurrentPage = 1;
  filterAndRenderCpos();
}

function resetCpoFilters() {
  cpoSearchTerm = '';
  cpoFilterBank = 'ALL';
  cpoFilterStatus = 'ALL';
  cpoFilterType = 'ALL';
  cpoCurrentPage = 1;

  const searchInput = document.getElementById('cpoQuickSearchInput');
  if (searchInput) searchInput.value = '';

  const bankSelect = document.getElementById('cpoFilterBankSelect');
  if (bankSelect) bankSelect.value = 'ALL';

  const statusSelect = document.getElementById('cpoFilterStatusSelect');
  if (statusSelect) statusSelect.value = 'ALL';

  const typeSelect = document.getElementById('cpoFilterTypeSelect');
  if (typeSelect) typeSelect.value = 'ALL';

  ['ALL', 'Abyssinia', 'Ethiopia', 'Awash', 'Abukii'].forEach(b => {
    const btn = document.getElementById(`cpo-bank-${b}`);
    if (btn) {
      btn.className = b === 'ALL'
        ? 'px-2.5 py-1 font-bold rounded bg-[#0284c7] text-white'
        : 'px-2.5 py-1 font-bold rounded text-slate-600 hover:bg-slate-200';
    }
  });

  ['ALL', 'HELD', 'RETURNED'].forEach(s => {
    const btn = document.getElementById(`cpo-status-${s}`);
    if (btn) {
      btn.className = s === 'ALL'
        ? 'px-2.5 py-0.5 rounded bg-slate-800 text-white'
        : 'px-2.5 py-0.5 rounded text-slate-600 hover:bg-slate-100';
    }
  });

  filterAndRenderCpos();
}

function filterAndRenderCpos() {
  let list = currentCpos || [];

  // Search filter
  if (cpoSearchTerm) {
    list = list.filter(c =>
      (c.fileRefNumber || '').toLowerCase().includes(cpoSearchTerm) ||
      (c.consigneeName || '').toLowerCase().includes(cpoSearchTerm) ||
      (c.blNumber || '').toLowerCase().includes(cpoSearchTerm) ||
      (c.bank || '').toLowerCase().includes(cpoSearchTerm) ||
      (c.type || '').toLowerCase().includes(cpoSearchTerm) ||
      (c.remarks || '').toLowerCase().includes(cpoSearchTerm) ||
      (c.purpose || '').toLowerCase().includes(cpoSearchTerm) ||
      (c.returnedTo || '').toLowerCase().includes(cpoSearchTerm)
    );
  }

  // Bank filter
  if (cpoFilterBank !== 'ALL') {
    list = list.filter(c => (c.bank || '').toLowerCase().includes(cpoFilterBank.toLowerCase()));
  }

  // Status filter
  if (cpoFilterStatus !== 'ALL') {
    list = list.filter(c => c.status === cpoFilterStatus);
  }

  // Type filter
  if (cpoFilterType !== 'ALL') {
    list = list.filter(c => (c.type || '') === cpoFilterType);
  }

  filteredCposList = list;
  renderCpoTable(filteredCposList);
}

function changeCpoPageSize(newSize) {
  cpoPageSize = newSize;
  cpoCurrentPage = 1;
  filterAndRenderCpos();
}

function setCpoPage(pageNum) {
  cpoCurrentPage = pageNum;
  filterAndRenderCpos();
}

function renderCpoTable(cpos) {
  const tbody = document.getElementById('cpoMasterTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const total = cpos.length;
  const pageSize = cpoPageSize === 'ALL' ? total || 1 : Number(cpoPageSize);
  const totalPages = Math.ceil(total / pageSize) || 1;
  if (cpoCurrentPage > totalPages) cpoCurrentPage = totalPages;
  if (cpoCurrentPage < 1) cpoCurrentPage = 1;

  const startIndex = (cpoCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageItems = cpos.slice(startIndex, endIndex);

  const countEl = document.getElementById('cpoEntriesCount');
  if (countEl) {
    countEl.textContent = total > 0
      ? `Showing ${startIndex + 1} to ${endIndex} of ${total} records`
      : 'Showing 0 of 0 records';
  }

  renderPaginationControls('cpoPaginationControls', cpoCurrentPage, totalPages, 'setCpoPage');

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400 italic">No CPO guarantee or deposit records found matching your filters.</td></tr>`;
    refreshIcons();
    return;
  }

  pageItems.forEach((cpo, index) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 hover:bg-slate-50 transition';

    const isHeld = cpo.status === 'HELD';
    const statusBadge = isHeld
      ? '<span class="badge-pill badge-held">🟡 HELD AT BANK</span>'
      : '<span class="badge-pill badge-paid">🟢 RETURNED</span>';

    const actionBtn = isHeld && cpo.category === 'GUARANTEE_CPO'
      ? `<button onclick="openReturnCpoModal('${cpo.id}', ${cpo.amount}, '${cpo.bank}')" class="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-2.5 py-1 rounded shadow-xs flex items-center gap-1 mx-auto">
          <i data-lucide="corner-up-left" class="w-3 h-3"></i>
          <span>Return CPO</span>
        </button>`
      : `<span class="text-[11px] text-slate-400 font-semibold">Settled</span>`;

    const returnDetails = cpo.returnedTo
      ? `<div class="text-[11px] text-emerald-800 font-bold">To: ${cpo.returnedTo}</div>
         <div class="text-[10px] text-slate-500">Date: ${cpo.returnDate || ''}</div>`
      : `<span class="text-[11px] text-slate-400 italic">Held in Vault</span>`;

    tr.innerHTML = `
      <td class="text-center font-bold text-slate-400 text-xs">${startIndex + index + 1}</td>
      <td>
        <span class="font-extrabold text-sky-800 text-xs cursor-pointer hover:underline" onclick="loadJobCockpit('${cpo.jobId}')">${cpo.fileRefNumber}</span>
      </td>
      <td>
        <div class="font-bold text-slate-900 text-xs">${cpo.consigneeName}</div>
        <div class="text-[10px] text-slate-500">B/L: ${cpo.blNumber}</div>
      </td>
      <td>
        <span class="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-xs font-semibold">${cpo.bank}</span>
      </td>
      <td>
        <span class="font-bold text-xs ${cpo.category === 'GUARANTEE_CPO' ? 'text-amber-800' : 'text-sky-800'}">${cpo.type}</span>
      </td>
      <td class="font-black text-slate-900 text-xs tabular-nums text-right">${Number(cpo.amount).toLocaleString()}.00 ETB</td>
      <td>${statusBadge}</td>
      <td>${returnDetails}</td>
      <td class="text-xs text-slate-600 max-w-xs truncate">${cpo.remarks || cpo.purpose || '-'}</td>
      <td class="text-center">${actionBtn}</td>
    `;
    tbody.appendChild(tr);
  });

  refreshIcons();
}

function exportCpoTableToCSV() {
  let csv = 'File Ref,Consignee,B/L Number,Bank Account,Deposit Type,Amount (ETB),Status,Returned To,Return Date,Remarks\n';
  currentCpos.forEach(c => {
    csv += `"${c.fileRefNumber}","${c.consigneeName}","${c.blNumber}","${c.bank}","${c.type}","${c.amount}","${c.status}","${c.returnedTo || ''}","${c.returnDate || ''}","${c.remarks || c.purpose || ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', 'Nohada_MultiBank_CPO_Registry.csv');
  a.click();
}

function switchCockpitTab(tabName) {
  document.getElementById('cockpit-content-ledger').classList.add('hidden');
  document.getElementById('cockpit-content-documents').classList.add('hidden');
  document.getElementById('cockpit-content-assessment').classList.add('hidden');

  ['ledger', 'documents', 'assessment'].forEach(t => {
    const btn = document.getElementById(`cockpit-tab-${t}`);
    if (btn) {
      btn.className = 'px-4 py-2 font-bold text-xs rounded-t-lg text-slate-600 hover:bg-slate-100';
    }
  });

  const activeBtn = document.getElementById(`cockpit-tab-${tabName}`);
  if (activeBtn) {
    activeBtn.className = 'px-4 py-2 font-bold text-xs rounded-t-lg bg-[#0284c7] text-white';
  }

  document.getElementById(`cockpit-content-${tabName}`).classList.remove('hidden');
  refreshIcons();
}

function filterTab(tab) {
  currentTabFilter = tab;
  jobsCurrentPage = 1;
  ['all', 'active', 'cleared'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (btn) {
      btn.className = t === tab ? 'px-2.5 py-1 rounded bg-[#0284c7] text-white' : 'px-2.5 py-1 rounded text-slate-600 hover:text-slate-900';
    }
  });
  renderJobsTable(currentJobs);
}

function applyFilters() {
  const consignee = document.getElementById('filterConsignee').value.trim();
  const tin = document.getElementById('filterTin').value.trim();
  const bl = document.getElementById('filterBl').value.trim();
  const port = document.getElementById('filterPort').value;

  const search = consignee || tin || bl;
  let query = '?';
  if (search) query += `search=${encodeURIComponent(search)}&`;
  if (port) query += `port=${encodeURIComponent(port)}`;

  jobsCurrentPage = 1;
  loadJobsTable(query);
}

function resetFilters() {
  document.getElementById('filterConsignee').value = '';
  document.getElementById('filterTin').value = '';
  document.getElementById('filterBl').value = '';
  document.getElementById('filterPort').value = 'ALL';
  const quickSearch = document.getElementById('tableQuickSearch');
  if (quickSearch) quickSearch.value = '';
  jobsCurrentPage = 1;
  loadJobsTable();
}

function handleQuickSearch(e) {
  jobsCurrentPage = 1;
  renderJobsTable(currentJobs);
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

function openNewJobModal() {
  switchView('newjob');
}

async function submitNewJobFile() {
  const consigneeName = document.getElementById('newJobConsigneeInput').value.trim();
  const blNumber = document.getElementById('newJobBlInput').value.trim();
  const fileRefNumber = document.getElementById('newJobRefInput').value.trim();
  const consigneeTin = document.getElementById('newJobTinInput').value.trim();
  const consigneePhone = document.getElementById('newJobPhoneInput').value.trim();
  const assignedStaff = document.getElementById('newJobStaffInput').value;
  const operationPort = document.getElementById('newJobPortInput').value;
  const containerNumber = document.getElementById('newJobContainerInput').value.trim();
  const containerType = document.getElementById('newJobContainerTypeInput').value;
  const initialDepositAmount = document.getElementById('newJobDepositAmountInput').value;
  const initialDepositBank = document.getElementById('newJobDepositBankInput').value;
  const initialDepositType = document.getElementById('newJobDepositTypeInput').value;

  if (!consigneeName || !blNumber) {
    alert('Please enter both Consignee Name and Bill of Lading Number.');
    return;
  }

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileRefNumber,
        consigneeName,
        consigneeTin,
        consigneePhone,
        blNumber,
        operationPort,
        assignedStaff,
        containerNumber,
        containerType,
        initialDepositAmount,
        initialDepositBank,
        initialDepositType
      })
    });

    if (res.ok) {
      const data = await res.json();
      closeModal('modalNewJob');
      alert(`✅ New Blue File Jacket (${data.job.fileRefNumber}) opened successfully!`);
      await loadDashboardData();
      await loadJobCockpit(data.job.id);
    } else {
      const err = await res.json();
      alert(`Error: ${err.error || 'Failed to open job file'}`);
    }
  } catch (err) {
    console.error('Error opening new job file:', err);
  }
}

async function toggleDocumentStatus(docCode) {
  if (!activeCockpitJob) return;

  try {
    const res = await fetch(`/api/jobs/${activeCockpitJob.id}/document`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docCode })
    });

    if (res.ok) {
      await loadJobCockpit(activeCockpitJob.id);
    }
  } catch (err) {
    console.error('Error toggling document status:', err);
  }
}

async function deleteJob(jobId) {
  if (!confirm('Are you sure you want to delete this job file?')) return;

  try {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      alert('Job file deleted successfully.');
      await loadDashboardData();
      switchView('dashboard');
    }
  } catch (err) {
    console.error('Error deleting job:', err);
  }
}

function openQuickSearchModal() {
  switchView('jobs');
  setTimeout(() => {
    const field = document.getElementById('filterConsignee');
    if (field) field.focus();
  }, 100);
}

function exportTableToCSV() {
  let csv = 'File Ref,Consignee,B/L Number,Container,Port,Staff,Status,CPO Status,Net Balance (ETB)\n';
  currentJobs.forEach(j => {
    csv += `"${j.fileRefNumber}","${j.consignee?.name || ''}","${j.blNumber}","${j.containerNumber}","${j.operationPort}","${j.assignedStaff || ''}","${j.status}","${j.cpoStatus}","${j.netBalance || 0}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', 'Nohada_Jobs_CPO_Ledger.csv');
  a.click();
}

// -----------------------------------------------------------------------------
// 11. NEW JOB FILE - FULL PAGE FORM
// -----------------------------------------------------------------------------
function toggleOtherInput(selectEl, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (selectEl.value === 'Other') {
    input.classList.remove('hidden');
    input.focus();
  } else {
    input.classList.add('hidden');
    input.value = '';
  }
}

function resetNewJobForm() {
  const fields = [
    'njFileRef', 'njConsignee', 'njTin', 'njPhone', 'njAddress', 'njRep',
    'njBl', 'njCargoDesc', 'njPkgQty', 'njGrossWeight', 'njCbm',
    'njContainer', 'njSeal', 'njVessel', 'njVoyage', 'njDepositAmount'
  ];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const otherInputs = ['njShippingLineOther', 'njDepositBankOther'];
  otherInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      el.classList.add('hidden');
    }
  });

  // Reset dropdowns to defaults
  const selects = {
    'njStaff': 'Imran (0911525317)',
    'njShippingLine': 'CMA CGM',
    'njDeliveryTerms': 'FOB',
    'njContainerType': "1*20' GP",
    'njDepositCategory': '',
    'njDepositType': 'CPO Guarantee',
    'njDepositBank': 'Bank of Abyssinia (BOA)'
  };
  Object.entries(selects).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  // Reset free days
  const freeDays = document.getElementById('njFreeDays');
  if (freeDays) freeDays.value = '14';

  // Reset port radio to MOJ
  const mojRadio = document.querySelector('input[name="njPort"][value="MOJ"]');
  if (mojRadio) mojRadio.checked = true;
}

async function submitNewJobFromPage() {
  const consigneeName = (document.getElementById('njConsignee')?.value || '').trim();
  const blNumber = (document.getElementById('njBl')?.value || '').trim();

  if (!consigneeName || !blNumber) {
    alert('Please enter both Consignee Name and Bill of Lading Number (marked with *).');
    return;
  }

  const fileRefNumber = (document.getElementById('njFileRef')?.value || '').trim();
  const assignedStaff = document.getElementById('njStaff')?.value || 'Imran (0911525317)';
  const operationPort = document.querySelector('input[name="njPort"]:checked')?.value || 'MOJ';
  const consigneeTin = (document.getElementById('njTin')?.value || '').trim();
  const consigneePhone = (document.getElementById('njPhone')?.value || '').trim();
  const consigneeAddress = (document.getElementById('njAddress')?.value || '').trim();
  const consigneeRep = (document.getElementById('njRep')?.value || '').trim();
  let shippingLine = document.getElementById('njShippingLine')?.value || 'CMA CGM';
  if (shippingLine === 'Other') {
    const customShip = (document.getElementById('njShippingLineOther')?.value || '').trim();
    shippingLine = customShip || 'Other Shipping Line';
  }
  const deliveryTerms = document.getElementById('njDeliveryTerms')?.value || 'FOB';
  const cargoDescription = (document.getElementById('njCargoDesc')?.value || '').trim();
  const packageQty = document.getElementById('njPkgQty')?.value || '';
  const grossWeightKg = document.getElementById('njGrossWeight')?.value || '';
  const cbm = document.getElementById('njCbm')?.value || '';
  const containerNumber = (document.getElementById('njContainer')?.value || '').trim();
  const containerType = document.getElementById('njContainerType')?.value || "1*20' GP";
  const sealNumber = (document.getElementById('njSeal')?.value || '').trim();
  const freeDaysRemaining = document.getElementById('njFreeDays')?.value || '14';
  const vesselName = (document.getElementById('njVessel')?.value || '').trim();
  const voyageNumber = (document.getElementById('njVoyage')?.value || '').trim();
  const initialDepositCategory = document.getElementById('njDepositCategory')?.value || '';
  const initialDepositAmount = document.getElementById('njDepositAmount')?.value || '';
  const initialDepositType = document.getElementById('njDepositType')?.value || '';
  let initialDepositBank = document.getElementById('njDepositBank')?.value || '';
  if (initialDepositBank === 'Other') {
    const customBank = (document.getElementById('njDepositBankOther')?.value || '').trim();
    initialDepositBank = customBank || 'Other Bank';
  }

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileRefNumber,
        consigneeName,
        consigneeTin,
        consigneePhone,
        consigneeAddress,
        consigneeRep,
        blNumber,
        operationPort,
        assignedStaff,
        shippingLine,
        deliveryTerms,
        cargoDescription,
        packageQty: Number(packageQty) || 100,
        grossWeightKg: Number(grossWeightKg) || 0,
        cbm: Number(cbm) || 0,
        containerNumber,
        containerType,
        sealNumber,
        freeDaysRemaining: Number(freeDaysRemaining) || 14,
        vesselName,
        voyageNumber,
        initialDepositAmount: initialDepositCategory ? initialDepositAmount : '',
        initialDepositBank: initialDepositCategory ? initialDepositBank : '',
        initialDepositType: initialDepositCategory ? initialDepositType : '',
        initialDepositCategory
      })
    });

    if (res.ok) {
      const data = await res.json();
      alert(`✅ Blue File Jacket "${data.job.fileRefNumber}" opened successfully!\n\nConsignee: ${consigneeName}\nPort: ${operationPort}\nB/L: ${blNumber}`);
      await loadDashboardData();
      await loadJobCockpit(data.job.id);
    } else {
      const err = await res.json();
      alert(`Error: ${err.error || 'Failed to open job file'}`);
    }
  } catch (err) {
    console.error('Error opening new job file:', err);
    alert('Network error. Please check the server connection.');
  }
}
