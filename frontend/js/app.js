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

let currentCpos = [];
let currentCpoBankFilter = 'ALL';
let currentCpoStatusFilter = 'ALL';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }
  loadDashboardData();
  initTaxEstimatorTable();
});

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

function renderJobsTable(jobs) {
  const tbody = document.getElementById('jobsTableBody');
  tbody.innerHTML = '';

  let filtered = jobs;
  if (currentTabFilter === 'active') {
    filtered = jobs.filter(j => j.status !== 'Cleared');
  } else if (currentTabFilter === 'cleared') {
    filtered = jobs.filter(j => j.status === 'Cleared');
  }

  document.getElementById('tableEntriesCount').textContent = `Showing ${filtered.length} entries`;

  filtered.forEach((job, index) => {
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
      <td class="text-center font-bold text-slate-400 text-xs">${index + 1}</td>
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

    refreshIcons();
  } catch (err) {
    console.error('Error loading cockpit:', err);
  }
}

function renderCockpitDeposits(deposits) {
  const tbody = document.getElementById('cockpitDepositsTable');
  tbody.innerHTML = '';

  deposits.forEach((dep) => {
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
}

function renderCockpitExpenses(expenses) {
  const tbody = document.getElementById('cockpitExpensesTable');
  tbody.innerHTML = '';

  expenses.forEach((exp) => {
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
function openPrintStatementModal() {
  const job = activeCockpitJob;
  if (!job) return;

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  document.getElementById('stmtDate').textContent = dateStr;
  document.getElementById('stmtFileRef').textContent = job.fileRefNumber;
  document.getElementById('stmtClientName').textContent = job.consignee?.name || 'BILAL SADIK YASIN';
  document.getElementById('stmtClientInfo').textContent = `TIN: ${job.consignee?.tin || 'Pending'} | Tel: ${job.consignee?.phone || '-'}`;
  document.getElementById('stmtClientAddress').textContent = job.consignee?.address || 'Addis Ababa';
  document.getElementById('stmtBl').textContent = job.blNumber;
  document.getElementById('stmtPort').textContent = `${job.operationPort} (Dry Port)`;
  document.getElementById('stmtContainer').textContent = `${job.containerNumber} (${job.containerType || "20' GP"})`;
  document.getElementById('stmtCargo').textContent = `${job.cargoDescription || 'Commercial Cargo'} (${job.packageQty || '100'} ${job.packageType || 'Pkgs'})`;
  document.getElementById('stmtStaffName').textContent = job.assignedStaff || 'Imran - Operations Head';
  document.getElementById('stmtClientSignName').textContent = `${job.consignee?.name || 'Customer'} / Representative`;

  // Render Table Rows dynamically
  const tbody = document.getElementById('stmtTableBody');
  tbody.innerHTML = '';

  let totalOperatingCash = 0;
  let totalExpenses = 0;

  // Deposits (Operating Cash)
  const opDeposits = (job.deposits || []).filter(d => d.category === 'OPERATIONAL_CASH');
  opDeposits.forEach(dep => {
    totalOperatingCash += Number(dep.amount) || 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="py-2 text-slate-800">
        <span class="font-bold">Client Cash Advance</span> - ${dep.bank} (${dep.purpose || 'Shipment Deposit'})
      </td>
      <td class="text-right text-slate-400">-</td>
      <td class="text-right font-semibold text-emerald-700">${Number(dep.amount).toLocaleString()}.00</td>
    `;
    tbody.appendChild(tr);
  });

  if (opDeposits.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="py-2 text-slate-500 italic">No operating advance deposited yet</td>
      <td class="text-right text-slate-400">-</td>
      <td class="text-right font-semibold text-slate-500">0.00</td>
    `;
    tbody.appendChild(tr);
  }

  // Expenses
  (job.expenses || []).forEach(exp => {
    totalExpenses += Number(exp.amount) || 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="py-2 text-slate-800">
        <span class="font-bold">${exp.category}</span>: ${exp.description} ${exp.paidTo ? '• ' + exp.paidTo : ''}
      </td>
      <td class="text-right font-semibold text-rose-700">${Number(exp.amount).toLocaleString()}.00</td>
      <td class="text-right text-slate-400">-</td>
    `;
    tbody.appendChild(tr);
  });

  // Totals Row
  const totalsRow = document.createElement('tr');
  totalsRow.className = 'bg-slate-100 font-bold border-t-2 border-slate-800';
  totalsRow.innerHTML = `
    <td class="py-2 font-black">TOTALS</td>
    <td class="text-right font-black text-rose-700">${totalExpenses.toLocaleString()}.00 ETB</td>
    <td class="text-right font-black text-emerald-700">${totalOperatingCash.toLocaleString()}.00 ETB</td>
  `;
  tbody.appendChild(totalsRow);

  // Net Balance Row
  const netBalance = totalOperatingCash - totalExpenses;
  const balanceRow = document.createElement('tr');
  if (netBalance < 0) {
    balanceRow.className = 'bg-red-50 text-red-900 font-black border-t-2 border-red-400';
    balanceRow.innerHTML = `
      <td class="py-3 text-sm uppercase">RECONCILED BALANCE DUE TO NOHADA</td>
      <td colspan="2" class="text-right text-base text-red-600">${netBalance.toLocaleString()}.00 ETB</td>
    `;
  } else if (netBalance > 0) {
    balanceRow.className = 'bg-emerald-50 text-emerald-900 font-black border-t-2 border-emerald-400';
    balanceRow.innerHTML = `
      <td class="py-3 text-sm uppercase">REFUND BALANCE DUE TO CLIENT</td>
      <td colspan="2" class="text-right text-base text-emerald-600">+${netBalance.toLocaleString()}.00 ETB</td>
    `;
  } else {
    balanceRow.className = 'bg-slate-50 text-slate-800 font-black border-t-2 border-slate-300';
    balanceRow.innerHTML = `
      <td class="py-3 text-sm uppercase">ACCOUNT SETTLED IN FULL</td>
      <td colspan="2" class="text-right text-base text-emerald-600">0.00 ETB</td>
    `;
  }
  tbody.appendChild(balanceRow);

  // Security CPO Guarantee Note
  const cpoDeposits = (job.deposits || []).filter(d => d.category === 'GUARANTEE_CPO');
  const cpoNoteEl = document.getElementById('stmtCpoNote');
  if (cpoDeposits.length > 0) {
    const cpoDescriptions = cpoDeposits.map(d => 
      `<strong>${Number(d.amount).toLocaleString()}.00 ETB</strong> at ${d.bank} [Status: <span class="${d.status === 'HELD' ? 'text-amber-800 font-bold' : 'text-emerald-700 font-bold'}">${d.status}</span>${d.returnedTo ? ' to ' + d.returnedTo : ''}]`
    ).join('; ');
    cpoNoteEl.innerHTML = `<strong>Security Guarantee Note:</strong> CPO Guarantee(s) of ${cpoDescriptions} recorded for empty container return guarantee.`;
  } else {
    cpoNoteEl.innerHTML = `<strong>Security Guarantee Note:</strong> No Security CPO Guarantees held on this file.`;
  }

  document.getElementById('modalPrintStatement').classList.remove('hidden');
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
    let query = '?';
    if (currentCpoBankFilter !== 'ALL') query += `bank=${encodeURIComponent(currentCpoBankFilter)}&`;
    if (currentCpoStatusFilter !== 'ALL') query += `status=${encodeURIComponent(currentCpoStatusFilter)}`;

    const res = await fetch(`/api/cpo${query}`);
    if (res.ok) {
      currentCpos = await res.json();
      renderCpoTable(currentCpos);
    }
  } catch (err) {
    console.error('Error fetching CPOs:', err);
  }
}

function renderCpoTable(cpos) {
  const tbody = document.getElementById('cpoMasterTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const countEl = document.getElementById('cpoEntriesCount');
  if (countEl) countEl.textContent = `Showing ${cpos.length} CPO & deposit records`;

  cpos.forEach((cpo, index) => {
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
      <td class="text-center font-bold text-slate-400 text-xs">${index + 1}</td>
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

function filterCpoByBank(bank) {
  currentCpoBankFilter = bank;
  ['ALL', 'Abyssinia', 'Ethiopia', 'Awash', 'Abukii'].forEach(b => {
    const btn = document.getElementById(`cpo-bank-${b}`);
    if (btn) {
      btn.className = b === bank
        ? 'px-2.5 py-1 text-xs font-bold rounded bg-[#0284c7] text-white'
        : 'px-2.5 py-1 text-xs font-bold rounded text-slate-600 hover:bg-slate-200';
    }
  });
  loadCpoTable();
}

function filterCpoByStatus(status) {
  currentCpoStatusFilter = status;
  ['ALL', 'HELD', 'RETURNED'].forEach(s => {
    const btn = document.getElementById(`cpo-status-${s}`);
    if (btn) {
      btn.className = s === status
        ? 'px-2.5 py-0.5 rounded bg-slate-800 text-white'
        : 'px-2.5 py-0.5 rounded text-slate-600 hover:bg-slate-100';
    }
  });
  loadCpoTable();
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

  loadJobsTable(query);
}

function resetFilters() {
  document.getElementById('filterConsignee').value = '';
  document.getElementById('filterTin').value = '';
  document.getElementById('filterBl').value = '';
  document.getElementById('filterPort').value = 'ALL';
  loadJobsTable();
}

function handleQuickSearch(e) {
  const q = e.target.value.toLowerCase();
  const filtered = currentJobs.filter(j => 
    j.fileRefNumber.toLowerCase().includes(q) ||
    (j.consignee?.name || '').toLowerCase().includes(q) ||
    (j.blNumber || '').toLowerCase().includes(q) ||
    (j.containerNumber || '').toLowerCase().includes(q)
  );
  renderJobsTable(filtered);
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
