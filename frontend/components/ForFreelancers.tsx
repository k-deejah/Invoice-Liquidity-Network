"use client";

import { useTheme } from "../hooks/useTheme";
import { useToast } from "../context/ToastContext";

export default function ForFreelancers() {
  const { theme } = useTheme();
  const { addToast, updateToast } = useToast();

  const handleListOnNetwork = async () => {
    const toastId = addToast({ type: "pending", title: "Submitting Invoice..." });
    try {
      // Simulate transaction delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      updateToast(toastId, { type: "success", title: "Invoice Listed", txHash: "4f8a9e2bc1...9d0" });
    } catch (error) {
      updateToast(toastId, { type: "error", title: "Listing Failed", message: "Transaction rejected." });
    }
  };

  const features = [
    {
      title: "Instant Liquidity",
      description: "Sell invoices and get funds in minutes, not months.",
    },
    {
      title: "Transparent Pricing",
      description: "You set the discount rate you're comfortable with.",
    },
    {
      title: "Global Market",
      description:
        "Access liquidity providers from around the world via Stellar.",
    },
  ];

  return (
    <section id="for-freelancers" className="bg-surface-container-low py-24 px-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-20 items-center">
        <div>
          <h2 className="text-4xl font-headline mb-6">
            Get paid today, not in 90 days.
          </h2>
          <ul className="space-y-6">
            {features.map((feature, index) => (
              <li key={index} className="flex gap-4">
                <span
                  className="material-symbols-outlined text-primary-container"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
                <div>
                  <p className="font-bold">{feature.title}</p>
                  <p className="text-on-surface-variant text-sm">
                    {feature.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        {/* Submission Mockup */}
        <div className="bg-surface-container-lowest p-8 rounded-xl shadow-xl border border-outline-variant/10">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">
              description
            </span>
            Submit New Invoice
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-on-surface-variant mb-2">
                Payer Entity
              </label>
              <input
                className="w-full bg-surface-container-low border-0 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                placeholder="Acme Corp Intl"
                type="text"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant mb-2">
                  Amount (USDC)
                </label>
                <input
                  className="w-full bg-surface-container-low border-0 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                  placeholder="5000.00"
                  type="number"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant mb-2">
                  Due Date
                </label>
                <input
                  className="w-full bg-surface-container-low border-0 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                  type="date"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-on-surface-variant mb-2">
                Discount Rate (%)
              </label>
              <div className="flex items-center gap-4">
                <input className="flex-1 accent-primary" type="range" />
                <span className="font-bold text-primary">3.5%</span>
              </div>
            </div>
            <button 
              onClick={handleListOnNetwork}
              className="w-full bg-primary text-surface-container-lowest py-4 rounded-lg font-bold mt-4 shadow-lg active:scale-[0.98] transition-transform"
            >
              List on Network
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
