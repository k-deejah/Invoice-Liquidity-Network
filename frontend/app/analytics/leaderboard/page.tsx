"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

type LeaderboardItem = {
  address: string;
  metric1?: number;
  metric2?: number;
};

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<"lp" | "freelancer">("lp");
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(false);

  const { address } = useAccount();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const res = await fetch(
          `/api/leaderboard?type=${activeTab}&period=${period}`
        );
        const result = await res.json();
        setData(result);
      } catch (err) {
        console.error(err);
      }

      setLoading(false);
    };

    fetchData();
  }, [activeTab, period]);

  const truncate = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const isUser = (addr: string) =>
    addr.toLowerCase() === address?.toLowerCase();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Leaderboard</h1>

      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setActiveTab("lp")}
          className={activeTab === "lp" ? "font-bold" : ""}
        >
          Top LPs
        </button>

        <button
          onClick={() => setActiveTab("freelancer")}
          className={activeTab === "freelancer" ? "font-bold" : ""}
        >
          Top Freelancers
        </button>
      </div>

      {/* Filter */}
      <select
        className="mb-4 border px-2 py-1"
        onChange={(e) => setPeriod(e.target.value)}
      >
        <option value="all">All time</option>
        <option value="30d">Last 30 days</option>
        <option value="7d">Last 7 days</option>
      </select>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="w-full border">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Address</th>
                <th>Metric 1</th>
                <th>Metric 2</th>
              </tr>
            </thead>

            <tbody>
              {data.slice(0, 20).map((row, i) => (
                <tr
                  key={i}
                  className={isUser(row.address) ? "bg-yellow-100" : ""}
                >
                  <td>{i + 1}</td>
                  <td>{truncate(row.address)}</td>
                  <td>{row.metric1 ?? "-"}</td>
                  <td>{row.metric2 ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}