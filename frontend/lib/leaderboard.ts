export async function getLeaderboard(type: string, period: string) {
  try {
    const res = await fetch(
      `${process.env.INDEXER_URL}/leaderboard?type=${type}&period=${period}`,
      {
        cache: "no-store",
      }
    );

    if (!res.ok) {
      throw new Error("Failed to fetch leaderboard");
    }

    return res.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}