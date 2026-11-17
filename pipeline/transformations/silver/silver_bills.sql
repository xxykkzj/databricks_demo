CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.silver_bills (
  CONSTRAINT valid_key EXPECT (bill_id IS NOT NULL AND account_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT non_negative_total EXPECT (total_aud >= 0),
  CONSTRAINT charges_reconcile EXPECT (abs(total_aud - (usage_charge_aud + fixed_charge_aud + wastewater_charge_aud)) <= 0.05),
  CONSTRAINT known_account EXPECT (region_id IS NOT NULL)
)
COMMENT 'One row per quarterly bill with billing quarter and customer attributes (region, holder type, concession, hardship, meter accuracy).'
CLUSTER BY (bill_quarter, region_id)
AS SELECT
  b.bill_id,
  b.account_id,
  b.meter_id,
  b.bill_period_start,
  b.bill_period_end,
  b.issued_on,
  CAST(date_trunc('QUARTER', b.bill_period_start) AS DATE) AS bill_quarter,
  concat(CAST(year(b.bill_period_start) AS STRING), '-Q', CAST(quarter(b.bill_period_start) AS STRING)) AS bill_quarter_label,
  b.billed_kl,
  b.tariff_code,
  b.usage_charge_aud,
  b.fixed_charge_aud,
  b.wastewater_charge_aud,
  b.total_aud,
  b.bill_status,
  c.region_id,
  c.region_name,
  c.dma_id,
  c.holder_type,
  c.property_type,
  c.concession_card,
  c.hardship_flag,
  c.meter_type,
  c.bench_error_pct
FROM water_utilities_medallion.bronze_bills b
LEFT JOIN water_utilities_medallion.silver_customer_accounts c ON b.account_id = c.account_id;
