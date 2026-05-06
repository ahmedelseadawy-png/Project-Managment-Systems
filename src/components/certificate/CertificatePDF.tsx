import "./CertificateStyles.css"
import { money } from "@/lib/money"

type CertificateLine = {
  item_code?: string
  description?: string
  unit?: string
  boq_qty?: number
  previous_cumulative_qty?: number
  current_qty?: number
  new_cumulative_qty?: number
  rate?: number
  current_value?: number
  cumulative_value?: number
}

export default function CertificatePDF({
  data,
  lines = [],
}: {
  data: any
  lines?: CertificateLine[]
}) {
  const gross = Number(data?.gross ?? data?.gross_amount ?? 0)
  const retention = Number(data?.retention ?? data?.retention_amount ?? 0)
  const deductions = Number(data?.deductions ?? data?.total_deductions ?? 0)
  const retentionRelease = Number(data?.retention_release ?? data?.retention_release_amount ?? 0)
  const afterDeductions = Number(data?.after_deductions ?? (gross - retention - deductions + retentionRelease))
  const previousPaid = Number(data?.previous_paid ?? data?.previous_paid_amount ?? 0)
  const finalPayable = Number(data?.final_payable ?? (afterDeductions - previousPaid))

  return (
    <div id="certificate" className="certificate-a4" dir="rtl">
      <header className="certificate-header">
        <div className="logo-box">
          <img src={data?.logo_url || "/assets/logo.png"} className="cert-logo" alt="Logo" />
        </div>

        <div className="cert-title">
          <h1>مستخلص مقاول باطن</h1>
          <h2>SUBCONTRACTOR PAYMENT CERTIFICATE</h2>
          <p>{data?.project_name_ar || data?.project_name || "Project Name"}</p>
        </div>

        <div className="cert-meta" dir="ltr">
          <div><strong>Invoice:</strong> {data?.invoice_no || "-"}</div>
          <div><strong>Date:</strong> {data?.invoice_date || "-"}</div>
          <div><strong>Status:</strong> {data?.status || "-"}</div>
        </div>
      </header>

      <section className="party-row">
        <div><strong>المقاول:</strong> {data?.subcontractor_name || data?.subcontractor || "-"}</div>
        <div><strong>الفترة حتى:</strong> {data?.period_end || data?.invoice_date || "-"}</div>
      </section>

      <table className="certificate-table">
        <thead>
          <tr>
            <th>#</th>
            <th>كود البند</th>
            <th>الوصف</th>
            <th>الوحدة</th>
            <th>السابق</th>
            <th>الحالي</th>
            <th>الإجمالي</th>
            <th>الفئة</th>
            <th>قيمة الحالي</th>
            <th>القيمة الإجمالية</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={10} className="empty-row">No lines available</td>
            </tr>
          ) : (
            lines.map((line, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td dir="ltr">{line.item_code || "-"}</td>
                <td>{line.description || "-"}</td>
                <td>{line.unit || "-"}</td>
                <td>{line.previous_cumulative_qty ?? 0}</td>
                <td>{line.current_qty ?? 0}</td>
                <td>{line.new_cumulative_qty ?? 0}</td>
                <td>{money(line.rate)}</td>
                <td>{money(line.current_value)}</td>
                <td>{money(line.cumulative_value)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <section className="financial-summary">
        <table>
          <tbody>
            <tr>
              <td>إجمالي الأعمال حتى تاريخه / Cumulative Gross Works</td>
              <td>{money(gross)}</td>
            </tr>
            <tr>
              <td>خصم التأمين / Retention Deduction</td>
              <td className="negative">- {money(retention)}</td>
            </tr>
            <tr>
              <td>خصومات أخرى / Other Deductions</td>
              <td className="negative">- {money(deductions)}</td>
            </tr>
            <tr>
              <td>رد تأمين / Retention Release</td>
              <td className="positive">+ {money(retentionRelease)}</td>
            </tr>
            <tr className="subtotal-row">
              <td>القيمة بعد الخصومات / Net Certificate Value</td>
              <td>{money(afterDeductions)}</td>
            </tr>
            <tr>
              <td>ما تم صرفه سابقاً / Previously Paid</td>
              <td>- {money(previousPaid)}</td>
            </tr>
            <tr className="final-row">
              <td>صافي المستحق للصرف / Final Payable</td>
              <td>{money(finalPayable)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer className="signature-row">
        <div>مدير المكتب الفني</div>
        <div>مدير المشروع</div>
        <div>المدير المالي</div>
        <div>رئيس مجلس الإدارة</div>
      </footer>
    </div>
  )
}
