export type FeedbackItem = {
  id: string;
  source: "app_store" | "intercom" | "sales" | "support" | "twitter";
  customer_tier: "free" | "pro" | "enterprise";
  category: "bug" | "feature_request" | "praise" | "complaint" | "question";
  sentiment: "negative" | "neutral" | "positive";
  urgency: "low" | "medium" | "high" | "critical";
  created_at: string;
  title: string;
  content: string;
};

export const feedbackItems: FeedbackItem[] = [
  {
    id: "fb_001",
    source: "support",
    customer_tier: "enterprise",
    category: "bug",
    sentiment: "negative",
    urgency: "critical",
    created_at: "2026-05-28",
    title: "Checkout fails after coupon apply",
    content:
      "Enterprise customers cannot complete checkout after applying volume discount coupons. The payment button stays disabled.",
  },
  {
    id: "fb_002",
    source: "intercom",
    customer_tier: "pro",
    category: "feature_request",
    sentiment: "neutral",
    urgency: "medium",
    created_at: "2026-05-29",
    title: "Need CSV export for reports",
    content:
      "Several pro users asked for CSV export from the analytics dashboard so they can share weekly summaries with finance.",
  },
  {
    id: "fb_003",
    source: "app_store",
    customer_tier: "free",
    category: "complaint",
    sentiment: "negative",
    urgency: "medium",
    created_at: "2026-05-30",
    title: "Mobile onboarding is confusing",
    content:
      "New users say the onboarding flow asks for too much information before showing product value.",
  },
  {
    id: "fb_004",
    source: "sales",
    customer_tier: "enterprise",
    category: "feature_request",
    sentiment: "neutral",
    urgency: "high",
    created_at: "2026-06-01",
    title: "SAML group mapping",
    content:
      "Enterprise prospects need SAML group mapping to automatically assign roles during login.",
  },
  {
    id: "fb_005",
    source: "twitter",
    customer_tier: "pro",
    category: "praise",
    sentiment: "positive",
    urgency: "low",
    created_at: "2026-06-02",
    title: "Dashboard feels faster",
    content:
      "Users noticed the dashboard loads much faster after the latest release and praised the cleaner chart interactions.",
  },
  {
    id: "fb_006",
    source: "support",
    customer_tier: "enterprise",
    category: "question",
    sentiment: "neutral",
    urgency: "medium",
    created_at: "2026-06-03",
    title: "Data retention policy",
    content:
      "A regulated customer asked whether audit logs can be retained for seven years and exported during compliance reviews.",
  },
  {
    id: "fb_007",
    source: "intercom",
    customer_tier: "pro",
    category: "bug",
    sentiment: "negative",
    urgency: "high",
    created_at: "2026-06-04",
    title: "Notifications arrive twice",
    content:
      "Project owners report duplicate email notifications when a teammate comments on the same task within a minute.",
  },
  {
    id: "fb_008",
    source: "app_store",
    customer_tier: "free",
    category: "feature_request",
    sentiment: "neutral",
    urgency: "low",
    created_at: "2026-06-05",
    title: "Dark mode request",
    content:
      "Free users keep asking for dark mode in the mobile app because the current interface is too bright at night.",
  },
];
