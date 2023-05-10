export const formatTimestampToHumanReadable = (
  timestamp: number | string
): string => {
  timestamp = Number(timestamp);
  const date = new Date(timestamp * 1000);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const year = date.getFullYear();
  const month = months[date.getMonth()];
  const day = date.getDate();
  const hour = date.getHours();
  const minute = "0" + date.getMinutes();
  const second = "0" + date.getSeconds();
  const formattedDate = `${month} ${day}, ${year} ${hour}:${minute.substr(
    -2
  )}:${second.substr(-2)} ${hour >= 12 ? "pm" : "am"}`;
  return formattedDate;
};
