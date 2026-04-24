import InvoiceDetailPage from "@/src/pages/InvoiceDetail";

export default function InvoiceDetailRoute({ params }: { params: { id: string } }) {
  return <InvoiceDetailPage id={params.id} />;
}
