export const formatINR = (amount) => {
  const num = Number(amount) || 0;
  const absFormatted = Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${num < 0 ? '-' : ''}₹${absFormatted}`;
};

