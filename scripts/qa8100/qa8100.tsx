import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { ProviderList } from "./components/providers/ProviderList";
import { TooltipProvider } from "./components/ui/tooltip";
import "./index.css";
import "./i18n";
mockIPC(() => null);
const noop = () => {};
const providers = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i), {
 id: String(i), name: i === 0 ? "My Alpha" : `My Provider ${i}`, sortIndex: i,
 settingsConfig: { auth: { OPENAI_API_KEY: "synthetic-fixture" }, config: 'model_provider = "custom"\n[model_providers.custom]\nbase_url = "https://example.invalid"' },
}]));
function Harness() {
 const [open, setOpen] = React.useState(false);
 return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <TooltipProvider><div style={{height: "100vh", display:"flex", flexDirection:"column"}}>
   <header style={{height:100,flexShrink:0, padding:24}}>Codex providers <button onClick={() => setOpen(!open)}>Search</button></header>
   <div id="main-content" className="min-h-0 flex-1 overflow-y-auto scroll-stable overflow-x-hidden px-6 pb-12 pt-3">
    <ProviderList providers={providers} currentProviderId="" appId="codex" searchOpen={open} onSearchOpenChange={setOpen} onSwitch={noop} onEdit={p => {document.body.dataset.edited = p.id}} onDelete={noop} onDuplicate={noop} onOpenWebsite={noop} switchMode={{ active:"direct",view:"direct",directId:null,routeId:null,failoverOn:false,queue:[],stackMembers:new Map(),routingReason:()=>"",serviceRunning:false,actions:{switchDirect:noop,needsRouteDialog:noop,exitAndUse:noop,routeTo:noop,queueAdd:noop,queueRemove:noop,queueMove:noop,stackAdd:noop,stackRemove:noop,stackSetDefault:noop} }} />
   </div>
  </div></TooltipProvider>
 </QueryClientProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
