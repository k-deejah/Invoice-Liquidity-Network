export async function getNotifications(address: string) {
  const res = await fetch(
    `${process.env.NOTIFICATION_API}/notifications/${address}`,
    { cache: "no-store" }
  );

  if (!res.ok) throw new Error("Failed to fetch notifications");

  return res.json();
}