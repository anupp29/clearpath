import { useState } from "react";
import type { Section } from "./types";
import { Layout } from "./components/Layout";
import { LivePrediction } from "./components/LivePrediction";
import { HotspotMap } from "./components/HotspotMap";
import { DispatchPlan } from "./components/DispatchPlan";
import { ModelInsights } from "./components/ModelInsights";
import { SystemHealth } from "./components/SystemHealth";

function SectionContent({ section }: { section: Section }) {
  switch (section) {
    case "prediction":
      return <LivePrediction />;
    case "map":
      return <HotspotMap />;
    case "dispatch":
      return <DispatchPlan />;
    case "insights":
      return <ModelInsights />;
    case "health":
      return <SystemHealth />;
  }
}

export default function App() {
  const [section, setSection] = useState<Section>("prediction");

  return (
    <Layout section={section} onSectionChange={setSection}>
      <SectionContent section={section} />
    </Layout>
  );
}
