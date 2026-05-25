import React from "react";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";

export default function RegimePage() {
  return (
    <RevealContainer threshold={0.1}>
      <GlassCard hierarchy="primary">
        <SectionHeader 
          title="Macro Regime" 
          description="HMM environment structure module. Currently under construction following the isolated architecture pattern." 
        />
      </GlassCard>
    </RevealContainer>
  );
}
