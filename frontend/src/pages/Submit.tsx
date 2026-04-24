"use client";

import { useSearchParams } from "next/navigation";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import SubmitInvoiceForm from "../../components/SubmitInvoiceForm";

export default function SubmitPage() {
  const searchParams = useSearchParams();
  
  const prefillId = searchParams.get("prefill_id");
  const initialValues = prefillId ? {
    payer: searchParams.get("payer") || "",
    amount: searchParams.get("amount") || "",
    discountRate: searchParams.get("discount") || "3.00",
    tokenId: searchParams.get("token") || "",
  } : undefined;

  return (
    <main className="min-h-screen bg-surface-container-lowest">
      <Navbar />
      
      <section className="pt-32 pb-20 px-6 md:px-8">
        <div className="max-w-5xl mx-auto">
          <SubmitInvoiceForm 
            initialValues={initialValues} 
            prefillId={prefillId || undefined} 
          />
        </div>
      </section>

      <Footer />
    </main>
  );
}
