const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/db.json');
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:ZBXgLFndIQXgmpJgeEMRzzHDMlhLSvoy@switchback.proxy.rlwy.net:33577/railway";

async function runMigration() {
  const isInternal = DATABASE_URL.includes('.railway.internal') || DATABASE_URL.includes('localhost');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: isInternal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });

  try {
    console.log('🔄 Connecting to PostgreSQL to merge and create all tables...');
    let data = { company: {}, stats: {}, demurrageAlerts: [], jobs: [] };
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }

    // 1. Create all relational tables
    await pool.query(`
      -- Company Table
      CREATE TABLE IF NOT EXISTS company_info (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        system_title VARCHAR(255),
        location TEXT,
        phone VARCHAR(100),
        tin VARCHAR(50),
        active_staff VARCHAR(100)
      );

      -- Stats Table
      CREATE TABLE IF NOT EXISTS erp_stats (
        id SERIAL PRIMARY KEY,
        active_job_files INT DEFAULT 0,
        active_count INT DEFAULT 0,
        cleared_count INT DEFAULT 0,
        total_cpo_guarantees NUMERIC(15,2) DEFAULT 0,
        cpo_held_count INT DEFAULT 0,
        cpo_returned_count INT DEFAULT 0,
        containers_in_transit INT DEFAULT 0,
        transit_mojo INT DEFAULT 0,
        transit_kality INT DEFAULT 0,
        transit_djibouti INT DEFAULT 0,
        total_disbursed NUMERIC(15,2) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Jobs Table
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(100) PRIMARY KEY,
        file_ref_number VARCHAR(100) NOT NULL,
        consignee_name VARCHAR(255),
        consignee_tin VARCHAR(50),
        consignee_phone VARCHAR(50),
        consignee_address TEXT,
        assigned_staff VARCHAR(100),
        status VARCHAR(50),
        status_step INT DEFAULT 1,
        operation_port VARCHAR(50),
        bl_number VARCHAR(100),
        shipping_line VARCHAR(100),
        vessel_name VARCHAR(100),
        voyage_number VARCHAR(50),
        origin_port VARCHAR(100),
        destination_port VARCHAR(100),
        delivery_terms VARCHAR(50),
        cargo_description TEXT,
        package_qty INT,
        package_type VARCHAR(100),
        gross_weight_kg NUMERIC(10,2),
        tare_weight_kg NUMERIC(10,2),
        cbm NUMERIC(10,2),
        container_number VARCHAR(100),
        container_type VARCHAR(50),
        seal_number VARCHAR(100),
        free_days_remaining INT,
        declaration_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        raw_data JSONB
      );

      -- Deposits / CPO Guarantees Table
      CREATE TABLE IF NOT EXISTS deposits (
        id VARCHAR(100) PRIMARY KEY,
        job_id VARCHAR(100),
        file_ref VARCHAR(100),
        date DATE,
        amount NUMERIC(15,2) NOT NULL,
        type VARCHAR(100),
        bank VARCHAR(100),
        category VARCHAR(100),
        purpose TEXT,
        status VARCHAR(50),
        returned_to VARCHAR(255),
        return_date DATE,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Expenses / Disbursements Table
      CREATE TABLE IF NOT EXISTS expenses (
        id VARCHAR(100) PRIMARY KEY,
        job_id VARCHAR(100),
        file_ref VARCHAR(100),
        date DATE,
        category VARCHAR(100),
        description TEXT,
        amount NUMERIC(15,2) NOT NULL,
        paid_to VARCHAR(255),
        receipt_no VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Demurrage Alerts Table
      CREATE TABLE IF NOT EXISTS demurrage_alerts (
        id VARCHAR(100) PRIMARY KEY,
        file_ref VARCHAR(100),
        container VARCHAR(100),
        consignee VARCHAR(255),
        port VARCHAR(100),
        free_days_remaining INT,
        status VARCHAR(50),
        message TEXT
      );

      -- Master State Table for seamless sync
      CREATE TABLE IF NOT EXISTS erp_state (
        id INT PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Structured PostgreSQL tables created (jobs, deposits, expenses, demurrage_alerts, erp_stats, company_info, erp_state)!');

    // 2. Populate company_info
    await pool.query('DELETE FROM company_info');
    if (data.company) {
      await pool.query(
        'INSERT INTO company_info (name, system_title, location, phone, tin, active_staff) VALUES ($1,$2,$3,$4,$5,$6)',
        [data.company.name, data.company.systemTitle, data.company.location, data.company.phone, data.company.tin, data.company.activeStaff]
      );
    }

    // 3. Populate erp_stats
    await pool.query('DELETE FROM erp_stats');
    if (data.stats) {
      const s = data.stats;
      await pool.query(
        `INSERT INTO erp_stats (active_job_files, active_count, cleared_count, total_cpo_guarantees, cpo_held_count, cpo_returned_count, containers_in_transit, transit_mojo, transit_kality, transit_djibouti, total_disbursed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [s.activeJobFiles, s.activeCount, s.clearedCount, s.totalCpoGuarantees, s.cpoHeldCount, s.cpoReturnedCount, s.containersInTransit, s.transitMojo, s.transitKality, s.transitDjibouti, s.totalDisbursed]
      );
    }

    // 4. Populate Demurrage Alerts
    await pool.query('DELETE FROM demurrage_alerts');
    if (Array.isArray(data.demurrageAlerts)) {
      for (const a of data.demurrageAlerts) {
        await pool.query(
          'INSERT INTO demurrage_alerts (id, file_ref, container, consignee, port, free_days_remaining, status, message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [a.id, a.fileRef, a.container, a.consignee, a.port, a.freeDaysRemaining, a.status, a.message]
        );
      }
    }

    // 5. Populate Jobs, Deposits, Expenses
    await pool.query('DELETE FROM expenses');
    await pool.query('DELETE FROM deposits');
    await pool.query('DELETE FROM jobs');

    if (Array.isArray(data.jobs)) {
      for (const j of data.jobs) {
        await pool.query(
          `INSERT INTO jobs (
            id, file_ref_number, consignee_name, consignee_tin, consignee_phone, consignee_address,
            assigned_staff, status, status_step, operation_port, bl_number, shipping_line,
            vessel_name, voyage_number, origin_port, destination_port, delivery_terms, cargo_description,
            package_qty, package_type, gross_weight_kg, tare_weight_kg, cbm, container_number,
            container_type, seal_number, free_days_remaining, declaration_data, raw_data
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
          )`,
          [
            j.id, j.fileRefNumber || j.id, j.consignee ? j.consignee.name : null, j.consignee ? j.consignee.tin : null, j.consignee ? j.consignee.phone : null, j.consignee ? j.consignee.address : null,
            j.assignedStaff, j.status, j.statusStep || 1, j.operationPort, j.blNumber, j.shippingLine,
            j.vesselName, j.voyageNumber, j.originPort, j.destinationPort, j.deliveryTerms, j.cargoDescription,
            j.packageQty, j.packageType, j.grossWeightKg, j.tareWeightKg, j.cbm, j.containerNumber,
            j.containerType, j.sealNumber, j.freeDaysRemaining, JSON.stringify(j.declaration || {}), JSON.stringify(j)
          ]
        );

        // Deposits
        if (Array.isArray(j.deposits)) {
          for (const dep of j.deposits) {
            await pool.query(
              `INSERT INTO deposits (id, job_id, file_ref, date, amount, type, bank, category, purpose, status, returned_to, return_date, remarks)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
              [dep.id, j.id, j.fileRefNumber || j.id, dep.date ? new Date(dep.date) : null, dep.amount, dep.type, dep.bank, dep.category, dep.purpose, dep.status, dep.returnedTo, dep.returnDate ? new Date(dep.returnDate) : null, dep.remarks]
            );
          }
        }

        // Expenses
        if (Array.isArray(j.expenses)) {
          for (const exp of j.expenses) {
            await pool.query(
              `INSERT INTO expenses (id, job_id, file_ref, date, category, description, amount, paid_to, receipt_no)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [exp.id, j.id, j.fileRefNumber || j.id, exp.date ? new Date(exp.date) : null, exp.category, exp.description, exp.amount, exp.paidTo, exp.receiptNo]
            );
          }
        }
      }
    }

    // 6. Ensure erp_state is also synced
    await pool.query(
      `INSERT INTO erp_state (id, data, updated_at) 
       VALUES (1, $1, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(data)]
    );

    console.log('✅ ALL tables merged, synced & populated in PostgreSQL!');
    
    // Summary
    const jobsCount = await pool.query('SELECT count(*) FROM jobs');
    const depositsCount = await pool.query('SELECT count(*) FROM deposits');
    const expensesCount = await pool.query('SELECT count(*) FROM expenses');
    const alertsCount = await pool.query('SELECT count(*) FROM demurrage_alerts');
    
    console.log(`📊 Current Counts:`);
    console.log(`   - Jobs: ${jobsCount.rows[0].count}`);
    console.log(`   - Deposits / CPO: ${depositsCount.rows[0].count}`);
    console.log(`   - Expenses: ${expensesCount.rows[0].count}`);
    console.log(`   - Demurrage Alerts: ${alertsCount.rows[0].count}`);

    await pool.end();
    return true;
  } catch (err) {
    console.error('❌ Migration error:', err);
    await pool.end();
    throw err;
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
