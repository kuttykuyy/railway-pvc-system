-- Rebate % is agreed once for the whole agreement (not per schedule).
-- Escalation % and bid rate % remain per-schedule inside contracts.schedules (Json).
ALTER TABLE "contracts" ADD COLUMN "rebatePercentage" DOUBLE PRECISION;
