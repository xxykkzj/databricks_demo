-- Customer and billing KPIs per billing quarter x region x tariff x holder type.
-- est_meter_unregistered_kl: estimated volume not registered because of meter error,
-- true volume = billed / (1 + bench_error_pct/100); positive = under-registration (lost revenue).
CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.gold_customer_billing_quarterly
COMMENT 'Gold: quarterly billing KPIs (revenue, kL, overdue, concession and hardship, meter accuracy) by region, tariff and holder type.'
CLUSTER BY (bill_quarter, region_id)
AS SELECT
  bill_quarter,
  bill_quarter_label,
  region_id,
  region_name,
  tariff_code,
  holder_type,
  COUNT(*) AS bills,
  COUNT(DISTINCT account_id) AS accounts_billed,
  SUM(billed_kl) AS billed_kl,
  SUM(usage_charge_aud) AS usage_charge_aud,
  SUM(fixed_charge_aud) AS fixed_charge_aud,
  SUM(wastewater_charge_aud) AS wastewater_charge_aud,
  SUM(total_aud) AS total_billed_aud,
  SUM(total_aud) / COUNT(*) AS avg_bill_aud,
  SUM(billed_kl) / COUNT(*) AS avg_billed_kl,
  COUNT_IF(bill_status = 'paid') AS paid_bills,
  COUNT_IF(bill_status = 'overdue') AS overdue_bills,
  COUNT_IF(bill_status = 'issued') AS issued_bills,
  SUM(CASE WHEN bill_status = 'overdue' THEN total_aud ELSE 0 END) AS overdue_aud,
  COUNT_IF(bill_status = 'overdue') / COUNT(*) AS overdue_rate,
  COUNT_IF(concession_card) AS concession_bills,
  COUNT_IF(hardship_flag) AS hardship_bills,
  COUNT_IF(meter_type = 'smart') AS smart_meter_bills,
  AVG(bench_error_pct) AS avg_meter_bench_error_pct,
  SUM(CASE WHEN bench_error_pct IS NOT NULL
           THEN billed_kl / (1 + bench_error_pct / 100.0) - billed_kl END) AS est_meter_unregistered_kl
FROM water_utilities_medallion.silver_bills
GROUP BY ALL;
