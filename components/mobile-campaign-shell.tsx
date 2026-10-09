"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronRight, Clock3, MessageSquare, MoreHorizontal, Search, type LucideIcon } from "lucide-react";
import { mobilePrimaryNavigation } from "@/lib/mobile-navigation";

export type MobileCampaignSection = { value: string; label: string; icon: LucideIcon };

type Props = {
  master: boolean;
  day: number;
  time: string;
  title: string;
  activeSection: string;
  sections: MobileCampaignSection[];
  conflictActive: boolean;
  pendingDamage: number;
  status: ReactNode;
  tools: ReactNode;
  notices: ReactNode;
  chat: ReactNode;
  children: ReactNode;
  onNavigate: (section: string) => void;
  onSearch?: () => void;
  priority?: string;
  scenePressure?: { noise: number; fear: number };
};

export function MobileCampaignShell({ master, day, time, title, activeSection, sections, conflictActive, pendingDamage, status, tools, notices, chat, children, onNavigate, onSearch, priority, scenePressure }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--mobile-viewport-height");
    const resize = () => root.style.setProperty("--mobile-viewport-height", viewport.scale === 1 ? `${viewport.height}px` : "100dvh");
    resize();
    viewport.addEventListener("resize", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      if (previous) root.style.setProperty("--mobile-viewport-height", previous);
      else root.style.removeProperty("--mobile-viewport-height");
    };
  }, []);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [activeSection]);
  const primary = mobilePrimaryNavigation({ master, conflictActive, pendingDamage });
  const isChat = activeSection === "chat", isMore = activeSection === "mais";
  function navigate(section: string) {
    onNavigate(section);
    contentRef.current?.scrollTo({ top: 0 });
  }
  return <div className="mobile-campaign">
    <header className="mobile-campaign-header">
      <div className="mobile-campaign-heading">
        <div><p><span>Dia {day}</span><Clock3 size={12} aria-hidden="true" /> {time}</p><h1>{isChat ? "Chat da mesa" : isMore ? "Mais" : title}</h1></div>
        <div className="mobile-campaign-header-actions">{status}{onSearch && <button type="button" className="mobile-icon-button" onClick={onSearch} aria-label="Buscar na campanha"><Search size={20} aria-hidden="true" /></button>}</div>
      </div>
      {scenePressure && <div className="mobile-scene-pressure" role="status" aria-label="Pressão da cena"><span>Barulho <b>{scenePressure.noise}/5</b></span><span>Medo <b>{scenePressure.fear}/12</b></span></div>}
      {priority && activeSection !== "conflito" && <button type="button" className="mobile-priority" onClick={() => navigate("conflito")}><span role="status" aria-live="polite">{priority}</span><ChevronRight size={16} aria-hidden="true" /></button>}
    </header>
    <div ref={contentRef} className={`mobile-campaign-content${isChat ? " is-chat" : ""}`}>
      <div className="mobile-campaign-notices">{notices}</div>
      <main id="campaign-main" className="mobile-page" tabIndex={-1} hidden={isChat || isMore}>{children}</main>
      {isMore && <main id="campaign-more" className="mobile-page mobile-more" tabIndex={-1}>
        <p className="mobile-section-label">Seções da campanha</p>
        <nav className="mobile-section-grid" aria-label="Todas as seções">{sections.map(section => <button type="button" key={section.value} onClick={() => navigate(section.value)}><section.icon size={22} aria-hidden="true" /><span>{section.label}</span><ChevronRight size={16} aria-hidden="true" /></button>)}</nav>
        <section className="mobile-tools" aria-label="Ferramentas da campanha"><h2>Ferramentas</h2>{tools}</section>
      </main>}
      <section className="mobile-chat-page" hidden={!isChat} aria-label="Chat da mesa">{chat}</section>
    </div>
    <nav className="mobile-bottom-nav" aria-label="Navegação principal">{primary.map(item => {
      const Icon = item.value === "chat" ? MessageSquare : sections.find(section => section.value === item.value)?.icon;
      return <button type="button" key={item.value} aria-current={activeSection === item.value ? "page" : undefined} onClick={() => navigate(item.value)}>{Icon && <Icon size={23} aria-hidden="true" />}<span>{item.label}</span></button>;
    })}<button type="button" aria-current={isMore || !primary.some(item => item.value === activeSection) ? "page" : undefined} onClick={() => navigate("mais")}><MoreHorizontal size={23} aria-hidden="true" /><span>Mais</span></button></nav>
  </div>;
}
