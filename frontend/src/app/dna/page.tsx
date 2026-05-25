import React from "react";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";

export default function DNAPage() {
  return (
    <RevealContainer threshold={0.1}>
      <GlassCard hierarchy="primary">
        <SectionHeader 
          title="Manager DNA" 
          description="Behavioral clustering intelligence module. Currently under construction following the isolated architecture pattern." 
        />
      </GlassCard>
    </RevealContainer>
  );
}
