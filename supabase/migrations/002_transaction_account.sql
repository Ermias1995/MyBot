-- Payment account / channel on expenses (Telebirr, CBE, Cash).

alter table transactions
  add column if not exists account text not null default 'Cash';

alter table transactions drop constraint if exists transactions_account_check;
alter table transactions
  add constraint transactions_account_check
  check (account in ('Telebirr', 'CBE', 'Cash'));
