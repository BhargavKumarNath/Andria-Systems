import React from "react";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";

export default function ArchitecturePage() {
  return (
    <RevealContainer threshold={0.1}>
      <GlassCard hierarchy="primary">
        <SectionHeader 
          title="System Architecture" 
          description="System internals module. Currently under construction following the isolated architecture pattern." 
        />
      </GlassCard>
    </RevealContainer>
  );
}
