import React from "react";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";

export default function SignalsPage() {
  return (
    <RevealContainer threshold={0.1}>
      <GlassCard hierarchy="primary">
        <SectionHeader 
          title="Alpha Signals" 
          description="Signal generation logic module. Currently under construction following the isolated architecture pattern." 
        />
      </GlassCard>
    </RevealContainer>
  );
}
