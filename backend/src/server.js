const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = path.join(__dirname, '../data/db.json');

app.use(cors());
app.use(express.json());

// PostgreSQL Configuration
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:ZBXgLFndIQXgmpJgeEMRzzHDMlhLSvoy@switchback.proxy.rlwy.net:33577/railway";
let pgPool = null;
let pgConnected = false;
let memoryCache = null;

async function initPostgres() {
  if (!DATABASE_URL) return;
  try {
    const isInternal = DATABASE_URL.includes('.railway.internal') || DATABASE_URL.includes('localhost');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: isInternal ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 4000
    });

    // Create state table if not exists
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS erp_state (
        id INT PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const res = await pgPool.query('SELECT data FROM erp_state WHERE id = 1');
    if (res.rows.length === 0) {
      let initialData = { jobs: [], stats: {}, demurrageAlerts: [] };
      try {
        initialData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      } catch (e) {}
      await pgPool.query('INSERT INTO erp_state (id, data) VALUES (1, $1)', [JSON.stringify(initialData)]);
      memoryCache = initialData;
      console.log('✅ PostgreSQL connected & seeded with initial demo data!');
    } else {
      memoryCache = res.rows[0].data;
      console.log('✅ PostgreSQL connected! Live ERP state loaded from PostgreSQL.');
    }
    pgConnected = true;
  } catch (err) {
    console.warn('ℹ️ PostgreSQL not reachable (using local db.json fallback):', err.message);
    pgPool = null;
    pgConnected = false;
  }
}

// Helper to read database
function readDB() {
  if (memoryCache) {
    return memoryCache;
  }
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    memoryCache = JSON.parse(data);
    return memoryCache;
  } catch (error) {
    console.error('Error reading db.json:', error);
    return { jobs: [], stats: {}, demurrageAlerts: [] };
  }
}

async function syncRelationalTables(data) {
  if (!pgPool || !pgConnected || !data) return;
  try {
    // 1. Update master state
    await pgPool.query(
      'INSERT INTO erp_state (id, data, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()',
      [JSON.stringify(data)]
    );

    // 2. Sync Jobs & child tables
    if (Array.isArray(data.jobs)) {
      for (const j of data.jobs) {
        await pgPool.query(
          `INSERT INTO jobs (
            id, file_ref_number, consignee_name, consignee_tin, consignee_phone, consignee_address,
            assigned_staff, status, status_step, operation_port, bl_number, shipping_line,
            vessel_name, voyage_number, origin_port, destination_port, delivery_terms, cargo_description,
            package_qty, package_type, gross_weight_kg, tare_weight_kg, cbm, container_number,
            container_type, seal_number, free_days_remaining, declaration_data, raw_data
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
          ) ON CONFLICT (id) DO UPDATE SET
            file_ref_number = EXCLUDED.file_ref_number,
            consignee_name = EXCLUDED.consignee_name,
            status = EXCLUDED.status,
            status_step = EXCLUDED.status_step,
            free_days_remaining = EXCLUDED.free_days_remaining,
            declaration_data = EXCLUDED.declaration_data,
            raw_data = EXCLUDED.raw_data`,
          [
            j.id, j.fileRefNumber || j.id, j.consignee ? j.consignee.name : null, j.consignee ? j.consignee.tin : null, j.consignee ? j.consignee.phone : null, j.consignee ? j.consignee.address : null,
            j.assignedStaff, j.status, j.statusStep || 1, j.operationPort, j.blNumber, j.shippingLine,
            j.vesselName, j.voyageNumber, j.originPort, j.destinationPort, j.deliveryTerms, j.cargoDescription,
            j.packageQty, j.packageType, j.grossWeightKg, j.tareWeightKg, j.cbm, j.containerNumber,
            j.containerType, j.sealNumber, j.freeDaysRemaining, JSON.stringify(j.declaration || {}), JSON.stringify(j)
          ]
        );
      }
    }
  } catch (e) {
    console.error('Relational sync error:', e.message);
  }
}

// Helper to write database
function writeDB(data) {
  memoryCache = data;
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing db.json:', error);
  }

  // Persist asynchronously to PostgreSQL if connected
  if (pgPool && pgConnected) {
    syncRelationalTables(data).catch(err => {
      console.error('Error persisting to PostgreSQL:', err.message);
    });
  }

  return true;
}

// 1. System stats (KPIs for the 4 colored cards)
app.get('/api/stats', (req, res) => {
  const db = readDB();
  
  // Calculate dynamic stats from jobs
  let totalDeposits = 0;
  let totalExpenses = 0;
  let cpoHeldCount = 0;
  let cpoReturnedCount = 0;
  let activeCount = 0;
  let clearedCount = 0;
  
  db.jobs.forEach(job => {
    if (job.status === 'Cleared') {
      clearedCount++;
    } else {
      activeCount++;
    }
    
    (job.deposits || []).forEach(dep => {
      if (dep.category === 'GUARANTEE_CPO') {
        if (dep.status === 'HELD') cpoHeldCount++;
        if (dep.status === 'RETURNED') cpoReturnedCount++;
      }
      totalDeposits += Number(dep.amount) || 0;
    });
    
    (job.expenses || []).forEach(exp => {
      totalExpenses += Number(exp.amount) || 0;
    });
  });

  res.json({
    activeJobFiles: db.jobs.length,
    activeCount,
    clearedCount,
    totalCpoGuarantees: db.stats.totalCpoGuarantees || 3450000,
    cpoHeldCount,
    cpoReturnedCount,
    containersInTransit: db.stats.containersInTransit || 18,
    totalDisbursed: totalExpenses
  });
});

// 2. Demurrage alerts
app.get('/api/alerts', (req, res) => {
  const db = readDB();
  res.json(db.demurrageAlerts || []);
});

// 3. Get all jobs (with search & filter)
app.get('/api/jobs', (req, res) => {
  const db = readDB();
  const { search, port, status } = req.query;
  
  let jobs = db.jobs.map(job => {
    // calculate ledger totals
    const totalDeposits = (job.deposits || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const operatingCash = (job.deposits || [])
      .filter(d => d.category === 'OPERATIONAL_CASH')
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const totalExpenses = (job.expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netBalance = operatingCash - totalExpenses;
    
    const heldCpo = (job.deposits || []).find(d => d.category === 'GUARANTEE_CPO' && d.status === 'HELD');
    
    return {
      ...job,
      totalDeposits,
      operatingCash,
      totalExpenses,
      netBalance,
      cpoStatus: heldCpo ? 'HELD' : 'RETURNED'
    };
  });

  if (search) {
    const q = search.toLowerCase();
    jobs = jobs.filter(j => 
      j.fileRefNumber.toLowerCase().includes(q) ||
      (j.consignee?.name || '').toLowerCase().includes(q) ||
      (j.consignee?.tin || '').toLowerCase().includes(q) ||
      (j.blNumber || '').toLowerCase().includes(q) ||
      (j.containerNumber || '').toLowerCase().includes(q)
    );
  }

  if (port && port !== 'ALL') {
    jobs = jobs.filter(j => j.operationPort === port);
  }

  if (status && status !== 'ALL') {
    jobs = jobs.filter(j => j.status.toLowerCase() === status.toLowerCase());
  }

  res.json(jobs);
});

// 4. Get single job detail (The Master Cockpit)
app.get('/api/jobs/:id', (req, res) => {
  const db = readDB();
  const idOrRef = req.params.id;
  const job = db.jobs.find(j => j.id === idOrRef || j.fileRefNumber.replace('/', '-') === idOrRef || j.fileRefNumber === idOrRef);
  
  if (!job) {
    return res.status(404).json({ error: 'Job file not found' });
  }

  const guaranteeCpos = (job.deposits || []).filter(d => d.category === 'GUARANTEE_CPO');
  const operatingCash = (job.deposits || [])
    .filter(d => d.category === 'OPERATIONAL_CASH')
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const totalExpenses = (job.expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netBalance = operatingCash - totalExpenses;

  res.json({
    ...job,
    financialSummary: {
      totalGuaranteeCpo: guaranteeCpos.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
      totalOperatingCash: operatingCash,
      totalExpenses,
      netBalance,
      balanceStatus: netBalance < 0 ? 'CLIENT_OWES_NOHADA' : netBalance > 0 ? 'REFUND_DUE' : 'SETTLED'
    }
  });
});

// 4b. Create New Job File (Digital Blue File Jacket)
app.post('/api/jobs', (req, res) => {
  const db = readDB();
  const {
    fileRefNumber,
    consigneeName,
    consigneeTin,
    consigneePhone,
    consigneeAddress,
    consigneeRep,
    blNumber,
    containerNumber,
    containerType,
    operationPort,
    assignedStaff,
    shippingLine,
    deliveryTerms,
    cargoDescription,
    packageQty,
    grossWeightKg,
    cbm,
    sealNumber,
    freeDaysRemaining,
    vesselName,
    voyageNumber,
    initialDepositAmount,
    initialDepositBank,
    initialDepositType,
    initialDepositCategory
  } = req.body;

  if (!consigneeName || !blNumber) {
    return res.status(400).json({ error: 'Consignee Name and Bill of Lading Number are required.' });
  }

  const generatedRef = fileRefNumber || `NOH-${String(db.jobs.length + 246).padStart(5, '0')}/26`;
  const jobId = generatedRef.replace('/', '-');

  const initialDeposits = [];
  if (initialDepositAmount && Number(initialDepositAmount) > 0 && initialDepositCategory) {
    initialDeposits.push({
      id: `dep-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      amount: Number(initialDepositAmount),
      type: initialDepositType || 'CPO Guarantee',
      bank: initialDepositBank || 'Bank of Abyssinia (BOA)',
      category: initialDepositCategory,
      purpose: initialDepositCategory === 'GUARANTEE_CPO' ? 'Container Empty Return Guarantee' : 'Initial Shipment Deposit',
      status: initialDepositCategory === 'GUARANTEE_CPO' ? 'HELD' : 'ACTIVE',
      returnedTo: null,
      returnDate: null,
      remarks: 'Registered upon file opening'
    });
  }

  const portNames = { 'MOJ': 'Mojo Dry Port', 'KAL': 'Kality Dry Port', 'DDL': 'Dewele / Djibouti' };

  const newJob = {
    id: jobId,
    fileRefNumber: generatedRef,
    consignee: {
      name: consigneeName,
      tin: consigneeTin || 'Pending TIN',
      phone: consigneePhone || '',
      address: consigneeAddress || 'Addis Ababa',
      customerRep: consigneeRep || consigneeName
    },
    assignedStaff: assignedStaff || 'Imran (0911525317)',
    status: 'In Transit',
    statusStep: 2,
    operationPort: operationPort || 'MOJ',
    blNumber: blNumber,
    shippingLine: shippingLine || 'CMA CGM',
    vesselName: vesselName || '',
    voyageNumber: voyageNumber || '',
    originPort: 'Nansha Pt (China)',
    destinationPort: portNames[operationPort] || 'Mojo Dry Port',
    deliveryTerms: deliveryTerms || 'FOB',
    cargoDescription: cargoDescription || 'General Commercial Cargo',
    packageQty: Number(packageQty) || 100,
    packageType: 'Packages (PK)',
    grossWeightKg: Number(grossWeightKg) || 0,
    tareWeightKg: 2180,
    cbm: Number(cbm) || 0,
    containerNumber: containerNumber || 'PENDING',
    containerType: containerType || "1*20' GP",
    sealNumber: sealNumber || 'SEAL-' + Math.floor(1000000 + Math.random() * 9000000),
    freeDaysRemaining: Number(freeDaysRemaining) || 14,
    declaration: {
      decRequestDate: new Date().toISOString().split('T')[0],
      decNumber: 'Pending Dec',
      decDate: null,
      customsTaxTotal: 0,
      transitPermitted: true,
      emptyGuaranteeApproved: false
    },
    deposits: initialDeposits,
    expenses: [],
    documents: [
      { code: '001', name: 'Import Licence', ref: 'Verified in eCMS', date: new Date().toISOString().split('T')[0], status: 'verified' },
      { code: '004', name: 'Commercial Invoice', ref: 'INV-' + blNumber, date: new Date().toISOString().split('T')[0], status: 'verified' },
      { code: '005', name: 'Packing List', ref: 'PL-' + blNumber, date: new Date().toISOString().split('T')[0], status: 'verified' },
      { code: '006', name: 'Bill of Lading', ref: blNumber, date: new Date().toISOString().split('T')[0], status: 'verified' },
      { code: '007', name: 'Certificate of Origin', ref: 'CO-CN', date: new Date().toISOString().split('T')[0], status: 'verified' },
      { code: '008', name: 'Bank Permit / Debit Advice', ref: 'BP-PENDING', date: null, status: 'missing' },
      { code: '034', name: 'Insurance Cost Voucher', ref: 'INS-PENDING', date: null, status: 'missing' },
      { code: 'DEC', name: 'Customs Assessment Notice', ref: 'Assessment Pending', date: null, status: 'missing' },
      { code: 'GRN', name: 'Guarantee Letter for Empty Return', ref: 'Pending Approval', date: null, status: 'missing' },
      { code: 'INT', name: 'Empty Container Interchange Receipt', ref: 'Pending Return', date: null, status: 'missing' }
    ]
  };

  db.jobs.unshift(newJob);
  writeDB(db);

  res.status(201).json({ success: true, job: newJob });
});

// 4c. Toggle Document Verified Status
app.put('/api/jobs/:id/document', (req, res) => {
  const db = readDB();
  const idOrRef = req.params.id;
  const { docCode, status } = req.body;

  const job = db.jobs.find(j => j.id === idOrRef || j.fileRefNumber === idOrRef);
  if (!job) {
    return res.status(404).json({ error: 'Job file not found' });
  }

  const doc = (job.documents || []).find(d => d.code === docCode);
  if (!doc) {
    return res.status(404).json({ error: 'Document code not found' });
  }

  doc.status = status || (doc.status === 'verified' ? 'missing' : 'verified');
  doc.date = new Date().toISOString().split('T')[0];
  writeDB(db);

  res.json({ success: true, document: doc });
});

// 4d. Delete Job File
app.delete('/api/jobs/:id', (req, res) => {
  const db = readDB();
  const idOrRef = req.params.id;

  const initialCount = db.jobs.length;
  db.jobs = db.jobs.filter(j => j.id !== idOrRef && j.fileRefNumber !== idOrRef);

  if (db.jobs.length === initialCount) {
    return res.status(404).json({ error: 'Job file not found' });
  }

  writeDB(db);
  res.json({ success: true, message: 'Job deleted successfully' });
});

// 4e. Update Job Progress Stage (1 to 7)
app.put('/api/jobs/:id/stage', (req, res) => {
  const db = readDB();
  const idOrRef = req.params.id;
  const { stage } = req.body;
  const stageNum = Math.max(1, Math.min(7, Number(stage) || 1));

  const job = db.jobs.find(j => j.id === idOrRef || j.fileRefNumber === idOrRef);
  if (!job) {
    return res.status(404).json({ error: 'Job file not found' });
  }

  job.statusStep = stageNum;

  // Sync human-readable status
  const stageNames = {
    1: 'Doc Received',
    2: 'At Djibouti',
    3: 'In Transit',
    4: 'Customs Check',
    5: 'Tax Paid',
    6: 'Cleared',
    7: 'Cleared'
  };
  job.status = stageNames[stageNum] || job.status;

  writeDB(db);
  res.json({ success: true, job });
});

// 4f. Update Job Customs Tax Assessment Notice (from eCMS or Tax Estimator)
app.put('/api/jobs/:id/tax-assessment', (req, res) => {
  const db = readDB();
  const idOrRef = req.params.id;
  const { decNumber, receiptNo, mode, duty, excise, surtax, socialWelfare, vat, withholding, totalTaxPaid } = req.body;

  const job = db.jobs.find(j => j.id === idOrRef || j.fileRefNumber === idOrRef);
  if (!job) {
    return res.status(404).json({ error: 'Job file not found' });
  }

  if (!job.declaration) job.declaration = {};
  if (decNumber) job.declaration.decNumber = decNumber;
  if (!job.declaration.taxBreakdown) job.declaration.taxBreakdown = {};

  const tax = job.declaration.taxBreakdown;
  if (receiptNo !== undefined) tax.receiptNo = receiptNo;
  if (mode !== undefined) tax.mode = mode;
  if (duty !== undefined) tax.importDuty = Number(duty) || 0;
  if (excise !== undefined) tax.exciseTax = Number(excise) || 0;
  if (surtax !== undefined) tax.surtax = Number(surtax) || 0;
  if (socialWelfare !== undefined) tax.socialWelfareTax = Number(socialWelfare) || 0;
  if (vat !== undefined) tax.vat = Number(vat) || 0;
  if (withholding !== undefined) tax.withholdingTax = Number(withholding) || 0;

  const calculatedTotal = (tax.importDuty || 0) + (tax.exciseTax || 0) + (tax.surtax || 0) + (tax.socialWelfareTax || 0) + (tax.vat || 0) + (tax.withholdingTax || 0);
  tax.totalTaxPaid = Number(totalTaxPaid) || calculatedTotal;
  job.declaration.customsTaxTotal = tax.totalTaxPaid;

  writeDB(db);
  res.json({ success: true, declaration: job.declaration });
});

// 5. Add Deposit / CPO
app.post('/api/cpo/deposit', (req, res) => {
  const db = readDB();
  const { jobId, amount, type, bank, category, purpose, remarks } = req.body;

  const job = db.jobs.find(j => j.id === jobId || j.fileRefNumber === jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job file not found' });
  }

  const newDeposit = {
    id: `dep-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    amount: Number(amount),
    type: type || 'CPO Guarantee',
    bank: bank || 'Bank of Abyssinia (BOA)',
    category: category || 'GUARANTEE_CPO',
    purpose: purpose || 'Container Guarantee',
    status: category === 'GUARANTEE_CPO' ? 'HELD' : 'ACTIVE',
    returnedTo: null,
    returnDate: null,
    remarks: remarks || ''
  };

  if (!job.deposits) job.deposits = [];
  job.deposits.push(newDeposit);
  writeDB(db);

  res.status(201).json({ success: true, deposit: newDeposit });
});

// 6. Return CPO Guarantee to Client
app.put('/api/cpo/return/:depositId', (req, res) => {
  const db = readDB();
  const { depositId } = req.params;
  const { returnedTo, returnDate, remarks } = req.body;

  let found = false;
  let updatedDeposit = null;

  db.jobs.forEach(job => {
    (job.deposits || []).forEach(dep => {
      if (dep.id === depositId) {
        dep.status = 'RETURNED';
        dep.returnedTo = returnedTo || 'Customer Agent';
        dep.returnDate = returnDate || new Date().toISOString().split('T')[0];
        if (remarks) dep.remarks = remarks;
        found = true;
        updatedDeposit = dep;
      }
    });
  });

  if (!found) {
    return res.status(404).json({ error: 'Deposit record not found' });
  }

  writeDB(db);
  res.json({ success: true, deposit: updatedDeposit });
});

// 6b. Get all CPOs and Deposits across all jobs (Master CPO Registry)
app.get('/api/cpo', (req, res) => {
  const db = readDB();
  const { bank, status } = req.query;

  let allDeposits = [];
  db.jobs.forEach(job => {
    (job.deposits || []).forEach(dep => {
      allDeposits.push({
        ...dep,
        jobId: job.id,
        fileRefNumber: job.fileRefNumber,
        consigneeName: job.consignee?.name || 'N/A',
        consigneeTin: job.consignee?.tin || '',
        blNumber: job.blNumber,
        containerNumber: job.containerNumber,
        operationPort: job.operationPort
      });
    });
  });

  if (bank && bank !== 'ALL') {
    allDeposits = allDeposits.filter(d => d.bank.toLowerCase().includes(bank.toLowerCase()));
  }

  if (status && status !== 'ALL') {
    allDeposits = allDeposits.filter(d => d.status.toLowerCase() === status.toLowerCase());
  }

  // Sort: HELD first, then by date desc
  allDeposits.sort((a, b) => {
    if (a.status === 'HELD' && b.status !== 'HELD') return -1;
    if (a.status !== 'HELD' && b.status === 'HELD') return 1;
    return new Date(b.date) - new Date(a.date);
  });

  res.json(allDeposits);
});

// 7. Add Disbursed Expense
app.post('/api/expenses', (req, res) => {
  const db = readDB();
  const { jobId, category, description, amount, paidTo, receiptNo } = req.body;

  const job = db.jobs.find(j => j.id === jobId || j.fileRefNumber === jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job file not found' });
  }

  const newExpense = {
    id: `exp-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    category: category || 'Transport',
    description: description || 'Port clearance expense',
    amount: Number(amount),
    paidTo: paidTo || 'Driver/Vendor',
    receiptNo: receiptNo || `RCP-${Math.floor(1000 + Math.random() * 9000)}`
  };

  if (!job.expenses) job.expenses = [];
  job.expenses.push(newExpense);
  writeDB(db);

  res.status(201).json({ success: true, expense: newExpense });
});

// 8. Tax Calculation Engine (Direct formula from TAX.xlsx)
app.post('/api/tax/estimate', (req, res) => {
  const { exchangeRate = 125.50, items = [] } = req.body;

  let grandTotalFobUsd = 0;
  let grandTotalFreightEtb = 0;
  let grandTotalInsuranceEtb = 0;
  let grandTotalOtherEtb = 0;
  let grandTotalDpvEtb = 0;
  let grandTotalDutyEtb = 0;
  let grandTotalExciseEtb = 0;
  let grandTotalSurtaxEtb = 0;
  let grandTotalVatEtb = 0;
  let grandTotalWhtEtb = 0;
  let grandTotalTaxEtb = 0;

  const calculatedItems = items.map((item, index) => {
    const qty = Number(item.qty) || 1;
    const unitPriceUsd = Number(item.unitPriceUsd) || 0;
    const fobUsd = qty * unitPriceUsd;
    
    const freightEtb = Number(item.freightEtb) || 0;
    const insuranceEtb = Number(item.insuranceEtb) || 0;
    const otherEtb = Number(item.otherEtb) || 0;

    // DPV Formula
    const dpvEtb = (fobUsd * exchangeRate) + freightEtb + insuranceEtb + otherEtb;
    
    // Ethiopian Tariff Rates (Ready made garments: Duty 35%, Excise 30%, Surtax 10%, VAT 15%, WHT 3%)
    const dutyRate = item.dutyRate !== undefined ? Number(item.dutyRate) : 0.35;
    const exciseRate = item.exciseRate !== undefined ? Number(item.exciseRate) : 0.057; // effective excise base
    
    const dutyEtb = dpvEtb * dutyRate;
    const exciseEtb = (dpvEtb + dutyEtb) * exciseRate;
    const surtaxEtb = (dpvEtb + dutyEtb + exciseEtb) * 0.10;
    const vatEtb = (dpvEtb + dutyEtb + exciseEtb + surtaxEtb) * 0.15;
    const whtEtb = dpvEtb * 0.03;
    const totalTaxEtb = dutyEtb + exciseEtb + surtaxEtb + vatEtb + whtEtb;

    grandTotalFobUsd += fobUsd;
    grandTotalFreightEtb += freightEtb;
    grandTotalInsuranceEtb += insuranceEtb;
    grandTotalOtherEtb += otherEtb;
    grandTotalDpvEtb += dpvEtb;
    grandTotalDutyEtb += dutyEtb;
    grandTotalExciseEtb += exciseEtb;
    grandTotalSurtaxEtb += surtaxEtb;
    grandTotalVatEtb += vatEtb;
    grandTotalWhtEtb += whtEtb;
    grandTotalTaxEtb += totalTaxEtb;

    return {
      id: item.id || index + 1,
      description: item.description,
      qty,
      unitPriceUsd,
      fobUsd: Number(fobUsd.toFixed(2)),
      freightEtb: Number(freightEtb.toFixed(2)),
      insuranceEtb: Number(insuranceEtb.toFixed(2)),
      otherEtb: Number(otherEtb.toFixed(2)),
      dpvEtb: Number(dpvEtb.toFixed(2)),
      dutyEtb: Number(dutyEtb.toFixed(2)),
      exciseEtb: Number(exciseEtb.toFixed(2)),
      surtaxEtb: Number(surtaxEtb.toFixed(2)),
      vatEtb: Number(vatEtb.toFixed(2)),
      whtEtb: Number(whtEtb.toFixed(2)),
      totalTaxEtb: Number(totalTaxEtb.toFixed(2))
    };
  });

  res.json({
    exchangeRate,
    items: calculatedItems,
    totals: {
      totalFobUsd: Number(grandTotalFobUsd.toFixed(2)),
      totalFreightEtb: Number(grandTotalFreightEtb.toFixed(2)),
      totalInsuranceEtb: Number(grandTotalInsuranceEtb.toFixed(2)),
      totalOtherEtb: Number(grandTotalOtherEtb.toFixed(2)),
      totalDpvEtb: Number(grandTotalDpvEtb.toFixed(2)),
      totalDutyEtb: Number(grandTotalDutyEtb.toFixed(2)),
      totalExciseEtb: Number(grandTotalExciseEtb.toFixed(2)),
      totalSurtaxEtb: Number(grandTotalSurtaxEtb.toFixed(2)),
      totalVatEtb: Number(grandTotalVatEtb.toFixed(2)),
      totalWhtEtb: Number(grandTotalWhtEtb.toFixed(2)),
      grandTotalTaxEtb: Number(grandTotalTaxEtb.toFixed(2))
    }
  });
});

// Serve frontend static assets from ../frontend
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// Fallback to index.html for SPA navigation
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

initPostgres().then(() => {
  app.listen(PORT, () => {
    console.log(`======================================================`);
    console.log(`🚀 NOHADA TRADING ERP - BACKEND API RUNNING ON PORT ${PORT}`);
    console.log(`🌐 System URL: http://localhost:${PORT}`);
    console.log(`📂 Database: ${pgConnected ? 'PostgreSQL (Railway)' : DB_PATH}`);
    console.log(`======================================================`);
  });
});
