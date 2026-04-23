"use client";

type Props = {
  notifications: any[];
  setNotifications: any;
  setUnread: any;
  onClose: () => void;
};

export default function NotificationDrawer({
  notifications,
  setNotifications,
  setUnread,
  onClose,
}: Props) {
  const markAsRead = (id: string) => {
    const updated = notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );

    setNotifications(updated);
    setUnread(updated.filter((n) => !n.read).length);
    localStorage.setItem("notifications", JSON.stringify(updated));
  };

  const markAllAsRead = () => {
    const updated = notifications.map((n) => ({
      ...n,
      read: true,
    }));

    setNotifications(updated);
    setUnread(0);
    localStorage.setItem("notifications", JSON.stringify(updated));
  };

  const getStyle = (type: string) => {
    switch (type) {
      case "funded":
        return "text-green-600";
      case "settled":
        return "text-blue-600";
      case "defaulted":
        return "text-red-600";
      case "warning":
        return "text-yellow-600";
      default:
        return "";
    }
  };

  return (
    <div className="fixed right-0 top-0 w-96 h-full bg-white shadow-lg p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between mb-4">
        <h2 className="text-lg font-semibold">Notification Centre</h2>
        <button onClick={onClose}>X</button>
      </div>

      <button
        onClick={markAllAsRead}
        className="mb-4 text-sm text-blue-600"
      >
        Mark all as read
      </button>

      {/* List */}
      <div className="space-y-3">
        {notifications.slice(0, 20).map((n) => (
          <div
            key={n.id}
            onClick={() => markAsRead(n.id)}
            className={`p-3 border rounded cursor-pointer ${
              n.read ? "opacity-50" : ""
            }`}
          >
            <p className={getStyle(n.type)}>
              {n.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}