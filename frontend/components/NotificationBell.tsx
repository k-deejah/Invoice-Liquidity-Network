"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import NotificationDrawer from "./NotificationDrawer";

export default function NotificationBell() {
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);

  const fetchNotifications = async () => {
    if (!address) return;

    const res = await fetch(
      `/api/notifications/${address}`
    );

    const data = await res.json();
    setNotifications(data);

    const unreadCount = data.filter((n: any) => !n.read).length;
    setUnread(unreadCount);
  };

  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [address]);

  return (
    <div className="relative">
      {/* Bell */}
      <button onClick={() => setOpen(true)}>
        🔔
        {unread > 0 && (
          <span className="bg-red-500 text-white text-xs px-2 rounded-full">
            {unread}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <NotificationDrawer
          notifications={notifications}
          setNotifications={setNotifications}
          setUnread={setUnread}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}