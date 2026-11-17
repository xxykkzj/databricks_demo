-- Gold vs source reconciliation for adllabs_096.water_utilities_medallion.
-- Every row should show matches = true. Run after each pipeline update.
-- Source: workshop_demo.water_utilities (synthetic, read-only).
WITH checks AS (
  SELECT 'gold_dma_nrw_daily rows = dma_flow_daily rows' AS check_name,
         (SELECT count(*) FROM adllabs_096.water_utilities_medallion.gold_dma_nrw_daily) AS gold_value,
         (SELECT count(*) FROM workshop_demo.water_utilities.dma_flow_daily) AS source_value
  UNION ALL
  SELECT 'gold_dma_nrw_daily main_breaks = main_breaks rows',
         (SELECT sum(main_breaks) FROM adllabs_096.water_utilities_medallion.gold_dma_nrw_daily),
         (SELECT count(*) FROM workshop_demo.water_utilities.main_breaks)
  UNION ALL
  SELECT 'gold_main_break_risk rows = water_mains rows',
         (SELECT count(*) FROM adllabs_096.water_utilities_medallion.gold_main_break_risk),
         (SELECT count(*) FROM workshop_demo.water_utilities.water_mains)
  UNION ALL
  SELECT 'gold_main_break_risk breaks_total = main_breaks rows',
         (SELECT sum(breaks_total) FROM adllabs_096.water_utilities_medallion.gold_main_break_risk),
         (SELECT count(*) FROM workshop_demo.water_utilities.main_breaks)
  UNION ALL
  SELECT 'gold_customer_billing_quarterly bills = bills rows',
         (SELECT sum(bills) FROM adllabs_096.water_utilities_medallion.gold_customer_billing_quarterly),
         (SELECT count(*) FROM workshop_demo.water_utilities.bills)
  UNION ALL
  SELECT 'gold_customer_billing_quarterly total_billed_aud = bills total_aud',
         (SELECT round(sum(total_billed_aud), 2) FROM adllabs_096.water_utilities_medallion.gold_customer_billing_quarterly),
         (SELECT round(sum(total_aud), 2) FROM workshop_demo.water_utilities.bills)
  UNION ALL
  SELECT 'gold_operations_daily days = storage_daily distinct days',
         (SELECT count(*) FROM adllabs_096.water_utilities_medallion.gold_operations_daily),
         (SELECT count(DISTINCT obs_date) FROM workshop_demo.water_utilities.storage_daily)
  UNION ALL
  SELECT 'gold_operations_daily murray_ml_pumped = pumping_daily ml_pumped',
         (SELECT round(sum(murray_ml_pumped), 1) FROM adllabs_096.water_utilities_medallion.gold_operations_daily),
         (SELECT round(sum(ml_pumped), 1) FROM workshop_demo.water_utilities.pumping_daily)
  UNION ALL
  SELECT 'gold_operations_daily wq_samples = water_quality_samples rows',
         (SELECT sum(wq_samples) FROM adllabs_096.water_utilities_medallion.gold_operations_daily),
         (SELECT count(*) FROM workshop_demo.water_utilities.water_quality_samples)
)
SELECT check_name, gold_value, source_value, gold_value = source_value AS matches
FROM checks
ORDER BY matches, check_name
