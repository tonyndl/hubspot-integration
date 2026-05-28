import styled, { keyframes, css, createGlobalStyle } from "styled-components";

// ─── Design tokens ────────────────────────────────────────────────────────────

export const tokens = {
  color: {
    hubspot: "#FF7A59",
    hubspotDark: "#e8623f",
    wix: "#3B5BDB",
    success: "#12B76A",
    successBg: "#ECFDF3",
    successText: "#027A48",
    warning: "#F79009",
    warningBg: "#FFFAEB",
    warningText: "#B54708",
    error: "#F04438",
    errorBg: "#FEF3F2",
    errorText: "#B42318",
    info: "#0BA5EC",
    infoBg: "#F0F9FF",
    infoText: "#026AA2",
    text: "#101828",
    textSecondary: "#344054",
    textMuted: "#667085",
    textDisabled: "#98A2B3",
    border: "#EAECF0",
    borderStrong: "#D0D5DD",
    bg: "#F9FAFB",
    bgHover: "#F2F4F7",
    surface: "#FFFFFF",
  },
  shadow: {
    xs: "0 1px 2px rgba(16,24,40,0.05)",
    sm: "0 1px 3px rgba(16,24,40,0.1), 0 1px 2px rgba(16,24,40,0.06)",
    md: "0 4px 8px -2px rgba(16,24,40,0.1), 0 2px 4px -2px rgba(16,24,40,0.06)",
  },
  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
    full: "9999px",
  },
  font: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif",
  },
};

// Keep legacy colors export for any imports that use it
export const colors = {
  primary: tokens.color.hubspot,
  primaryHover: tokens.color.hubspotDark,
  hubspot: tokens.color.hubspot,
  success: tokens.color.success,
  warning: tokens.color.warning,
  error: tokens.color.error,
  text: tokens.color.text,
  textMuted: tokens.color.textMuted,
  border: tokens.color.border,
  background: tokens.color.bg,
  white: tokens.color.surface,
  surface: tokens.color.surface,
};

// ─── Animations ───────────────────────────────────────────────────────────────

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

// ─── Layout ───────────────────────────────────────────────────────────────────

export const Shell = styled.div`
  min-height: 100vh;
  background: ${tokens.color.bg};
  font-family: ${tokens.font.sans};
  color: ${tokens.color.text};
`;

export const PageWrapper = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 0 24px 48px;
  animation: ${fadeUp} 0.25s ease;
`;

// Legacy alias
export const PageContainer = PageWrapper;
export const PageTitle = styled.h1`
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
`;
export const PageSubtitle = styled.p`
  font-size: 14px;
  color: ${tokens.color.textMuted};
  margin: 0 0 24px;
`;

// ─── Card ─────────────────────────────────────────────────────────────────────

export const Card = styled.div<{ noPad?: boolean }>`
  background: ${tokens.color.surface};
  border: 1px solid ${tokens.color.border};
  border-radius: ${tokens.radius.lg};
  box-shadow: ${tokens.shadow.sm};
  ${(p) => !p.noPad && `padding: 24px;`}
  margin-bottom: 20px;
  animation: ${fadeUp} 0.2s ease;
`;

// Legacy aliases
export const Section = Card;
export const SectionTitle = styled.h3`
  font-size: 15px;
  font-weight: 600;
  color: ${tokens.color.text};
  margin: 0 0 4px;
`;

// ─── Tab navigation ───────────────────────────────────────────────────────────

export const TabList = styled.div`
  display: flex;
  gap: 4px;
  background: ${tokens.color.border};
  border-radius: ${tokens.radius.lg};
  padding: 4px;
  margin-bottom: 24px;
  width: fit-content;
`;

export const TabButton = styled.button<{
  active?: boolean;
  disabled?: boolean;
}>`
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: ${tokens.radius.md};
  cursor: ${(p) => (p.disabled ? "not-allowed" : "pointer")};
  transition: all 0.15s ease;
  white-space: nowrap;
  font-family: ${tokens.font.sans};

  ${(p) =>
    p.active
      ? css`
          background: ${tokens.color.surface};
          color: ${tokens.color.text};
          box-shadow: ${tokens.shadow.sm};
        `
      : p.disabled
        ? css`
            background: transparent;
            color: ${tokens.color.textDisabled};
          `
        : css`
            background: transparent;
            color: ${tokens.color.textMuted};
            &:hover {
              background: rgba(255, 255, 255, 0.6);
              color: ${tokens.color.text};
            }
          `}
`;

// ─── Buttons ──────────────────────────────────────────────────────────────────

interface BtnProps {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = styled.button<BtnProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: none;
  font-family: ${tokens.font.sans};
  font-weight: 500;
  border-radius: ${tokens.radius.md};
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  ${(p) =>
    p.size === "lg"
      ? css`
          padding: 12px 24px;
          font-size: 15px;
        `
      : p.size === "sm"
        ? css`
            padding: 6px 14px;
            font-size: 13px;
          `
        : css`
            padding: 9px 18px;
            font-size: 14px;
          `}

  ${(p) =>
    p.variant === "secondary"
      ? css`
          background: ${tokens.color.surface};
          border: 1px solid ${tokens.color.borderStrong};
          color: ${tokens.color.textSecondary};
          box-shadow: ${tokens.shadow.xs};
          &:hover:not(:disabled) {
            background: ${tokens.color.bg};
          }
        `
      : p.variant === "danger"
        ? css`
            background: ${tokens.color.errorBg};
            border: 1px solid #fecdca;
            color: ${tokens.color.errorText};
            &:hover:not(:disabled) {
              background: #fee4e2;
            }
          `
        : p.variant === "ghost"
          ? css`
              background: transparent;
              color: ${tokens.color.textMuted};
              &:hover:not(:disabled) {
                background: ${tokens.color.bgHover};
                color: ${tokens.color.text};
              }
            `
          : css`
              background: ${tokens.color.hubspot};
              color: white;
              box-shadow: 0 1px 2px rgba(255, 122, 89, 0.3);
              &:hover:not(:disabled) {
                background: ${tokens.color.hubspotDark};
                box-shadow: 0 2px 6px rgba(255, 122, 89, 0.35);
              }
            `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:active:not(:disabled) {
    transform: scale(0.98);
  }
`;

// ─── Status badge ─────────────────────────────────────────────────────────────

type StatusType =
  | "connected"
  | "disconnected"
  | "syncing"
  | "error"
  | "pending";

export const StatusBadge = styled.span<{ status: StatusType }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: ${tokens.radius.full};
  font-size: 12px;
  font-weight: 500;

  background: ${(p) =>
    p.status === "connected"
      ? tokens.color.successBg
      : p.status === "error"
        ? tokens.color.errorBg
        : p.status === "syncing" || p.status === "pending"
          ? tokens.color.warningBg
          : tokens.color.bg};

  color: ${(p) =>
    p.status === "connected"
      ? tokens.color.successText
      : p.status === "error"
        ? tokens.color.errorText
        : p.status === "syncing" || p.status === "pending"
          ? tokens.color.warningText
          : tokens.color.textMuted};

  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: ${(p) =>
      p.status === "connected"
        ? tokens.color.success
        : p.status === "error"
          ? tokens.color.error
          : p.status === "syncing" || p.status === "pending"
            ? tokens.color.warning
            : tokens.color.textDisabled};
    ${(p) =>
      p.status === "connected" &&
      css`
        animation: ${pulse} 2.5s ease-in-out infinite;
      `}
  }
`;

export const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: ${tokens.color.bg};
  border: 1px solid ${tokens.color.border};
  border-radius: ${tokens.radius.full};
  font-size: 11px;
  font-weight: 500;
  color: ${tokens.color.textMuted};
`;

// ─── Table ────────────────────────────────────────────────────────────────────

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

export const Th = styled.th`
  text-align: left;
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 600;
  color: ${tokens.color.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.6px;
  border-bottom: 1px solid ${tokens.color.border};
  background: ${tokens.color.bg};
`;

export const Td = styled.td`
  padding: 11px 14px;
  border-bottom: 1px solid ${tokens.color.border};
  vertical-align: middle;
  color: ${tokens.color.textSecondary};
`;

export const Tr = styled.tr`
  transition: background 0.1s;
  &:last-child td {
    border-bottom: none;
  }
  &:hover td {
    background: ${tokens.color.bg};
  }
`;

// ─── Form controls ────────────────────────────────────────────────────────────

export const Select = styled.select`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid ${tokens.color.borderStrong};
  border-radius: ${tokens.radius.sm};
  font-size: 13px;
  font-family: ${tokens.font.sans};
  color: ${tokens.color.textSecondary};
  background: ${tokens.color.surface};
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
  &:focus {
    outline: none;
    border-color: ${tokens.color.hubspot};
    box-shadow: 0 0 0 3px rgba(255, 122, 89, 0.12);
  }
`;

// ─── Alert ────────────────────────────────────────────────────────────────────

type AlertVariant = "info" | "success" | "warning" | "error";

export const Alert = styled.div<{ variant?: AlertVariant }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-radius: ${tokens.radius.md};
  font-size: 13px;
  line-height: 1.5;
  border-left: 3px solid;
  animation: ${fadeUp} 0.2s ease;

  ${(p) =>
    p.variant === "success"
      ? css`
          background: ${tokens.color.successBg};
          border-color: ${tokens.color.success};
          color: ${tokens.color.successText};
        `
      : p.variant === "warning"
        ? css`
            background: ${tokens.color.warningBg};
            border-color: ${tokens.color.warning};
            color: ${tokens.color.warningText};
          `
        : p.variant === "error"
          ? css`
              background: ${tokens.color.errorBg};
              border-color: ${tokens.color.error};
              color: ${tokens.color.errorText};
            `
          : css`
              background: ${tokens.color.infoBg};
              border-color: ${tokens.color.info};
              color: ${tokens.color.infoText};
            `}
`;

// ─── Spinner ──────────────────────────────────────────────────────────────────

export const Spinner = styled.span<{ size?: number }>`
  display: inline-block;
  width: ${(p) => p.size ?? 16}px;
  height: ${(p) => p.size ?? 16}px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.65s linear infinite;
  flex-shrink: 0;
`;

// ─── Stat cards ───────────────────────────────────────────────────────────────

export const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
`;

export const StatCard = styled.div<{ alert?: boolean }>`
  background: ${tokens.color.surface};
  border: 1px solid ${(p) => (p.alert ? "#FECDCA" : tokens.color.border)};
  border-radius: ${tokens.radius.md};
  padding: 16px 18px;
  box-shadow: ${tokens.shadow.xs};
`;

export const StatValue = styled.div<{ alert?: boolean }>`
  font-size: 28px;
  font-weight: 700;
  color: ${(p) => (p.alert ? tokens.color.error : tokens.color.text)};
  line-height: 1;
  margin-bottom: 6px;
`;

export const StatLabel = styled.div`
  font-size: 12px;
  color: ${tokens.color.textMuted};
  font-weight: 500;
`;

// ─── Empty state ──────────────────────────────────────────────────────────────

export const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
`;

export const EmptyStateIcon = styled.div`
  font-size: 36px;
  margin-bottom: 12px;
  opacity: 0.45;
`;

export const EmptyStateTitle = styled.p`
  font-size: 14px;
  font-weight: 500;
  color: ${tokens.color.textSecondary};
  margin: 0 0 4px;
`;

export const EmptyStateDesc = styled.p`
  font-size: 13px;
  color: ${tokens.color.textMuted};
  margin: 0;
`;

// ─── Misc ─────────────────────────────────────────────────────────────────────

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

export const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${tokens.color.border};
  margin: 20px 0;
`;

export const Spacer = styled.div<{ h?: number }>`
  height: ${(p) => p.h ?? 16}px;
`;

// Legacy — kept so old imports don't break
export const HubSpotBrandBar = styled.div`
  display: none;
`;
