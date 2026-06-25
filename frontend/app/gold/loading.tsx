import { Box, CircularProgress } from "@mui/material";

export default function GoldLoading() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#080d18",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress size={32} sx={{ color: "#fbbf24" }} />
    </Box>
  );
}
