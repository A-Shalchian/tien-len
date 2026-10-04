alter table chip_ledger drop constraint if exists chip_ledger_reason_check;
alter table chip_ledger add constraint chip_ledger_reason_check
  check (reason in ('signup', 'daily', 'game', 'undo', 'admin', 'online'));
