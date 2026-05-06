-- V140_18
-- Make the permission matrix match the real Dashboard sidebar module keys.
-- Safe additive migration: no data is dropped.

insert into public.erp_modules(module_key, module_label, module_category, sort_order, is_active)
values
  ('home', 'Home', 'Main', 1, true),
  ('approval-center', 'Assigned Approvals', 'Main', 2, true),
  ('workflow', 'Workflow', 'Main', 3, true),
  ('approval-matrix', 'Approval Matrix', 'Settings', 4, true),
  ('dashboard', 'Dashboard', 'Project', 10, true),
  ('projects', 'Projects', 'Project', 11, true),
  ('structure', 'Project Structure', 'Project', 12, true),
  ('boq', 'BOQ', 'Project', 20, true),
  ('bbs-qs', 'BBS & QS', 'Project', 30, true),
  ('subcontractors', 'Subcontractors', 'Project', 34, true),
  ('subcontractor-dashboard', 'Subcontractor Dashboard', 'Project', 35, true),
  ('workfronts', 'Workfronts', 'Project', 36, true),
  ('site-progress', 'Site Progress', 'Project', 37, true),
  ('breakdown', 'Subcontractor Contracts', 'Project', 40, true),
  ('certificates', 'Subcontractor Invoices', 'Project', 50, true),
  ('client-invoices', 'Client Invoices', 'Finance', 51, true),
  ('technical', 'Technical Office', 'Project', 55, true),
  ('procurement', 'Procurement', 'Project', 70, true),
  ('rfqs', 'RFQs', 'Project', 71, true),
  ('supplier-offers', 'Supplier Offers', 'Project', 72, true),
  ('procurement-quotations', 'Procurement Quotations', 'Project', 73, true),
  ('quotation-comparison', 'Quotation Comparison', 'Project', 74, true),
  ('inventory', 'Inventory / Stores', 'Project', 80, true),
  ('villas', 'Villa Tracker', 'Project', 90, true),
  ('finance', 'Finance', 'Finance', 110, true),
  ('payment-requests', 'Payment Requests', 'Finance', 111, true),
  ('commercial', 'Commercial', 'Finance', 112, true),
  ('tendering', 'Tendering & Cost', 'Finance', 113, true),
  ('variations', 'Variations', 'Finance', 114, true),
  ('schedule', 'P6 Schedule', 'Project', 115, true),
  ('reports', 'Reports', 'Reports', 120, true),
  ('company-branding', 'Company Branding', 'Settings', 200, true),
  ('permissions', 'Permissions', 'Settings', 210, true),
  ('approvals', 'QS Approvals', 'Settings', 220, true)
on conflict (module_key) do update set
  module_label = excluded.module_label,
  module_category = excluded.module_category,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

