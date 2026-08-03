"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BarChart3, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Copy, Download, Edit3, Gauge, LayoutDashboard, Mail, MapPin, Menu, MoreHorizontal, Plus, Save, Search, Sparkles, Target, Trash2, X } from "lucide-react";
import { demoLeads } from "@/lib/demo";
import { issueLabels, Lead, LeadStatus, scoreLead, statuses } from "@/lib/types";
import { isSupabaseConfigured, dbLoadLeads, dbSaveLead, dbDeleteLead } from "@/lib/db";
import { FindLeads } from "@/components/find-leads";

const storageKey="website-rescue-leads-v1";
const emptyLead: Lead={id:"",company:"",niche:"",city:"",website:"",contactName:"",email:"",phone:"",status:"New",value:2500,notes:"",createdAt:"",issues:{mobile:false,slow:false,dated:false,noCta:false,noBooking:false,noSsl:false}};
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
const statusClass=(s:LeadStatus)=>`status status-${s.toLowerCase()}`;
const buildOutreachDraft=(lead:Lead)=>lead.outreachCurrent ?? `Subject: Quick idea for ${lead.company||"your website"}\n\nHi ${lead.contactName||"there"},\n\nI took a look at ${lead.company||"your website"}${lead.city?` (${lead.niche||"business"} in ${lead.city})`:""} and spotted a few things that could be improved. That may be costing you inquiries and calls.\n\nI design clean, fast websites for ${lead.niche||"local businesses"} that turn visitors into customers. Would you be open to a quick concept? No pressure — I'd be happy to send it over for free.\n\nBest,\n[Your name]\nWebsite Rescue`;

export function RescueApp(){
 const [leads,setLeads]=useState<Lead[]>([]); const [ready,setReady]=useState(false); const [view,setView]=useState<"dashboard"|"leads"|"find">("dashboard"); const [editing,setEditing]=useState<Lead|null>(null); const [query,setQuery]=useState(""); const [status,setStatus]=useState("All"); const [toast,setToast]=useState(""); const [mobileNav,setMobileNav]=useState(false);
 useEffect(()=>{(async()=>{if(isSupabaseConfigured){const data=await dbLoadLeads();if(data!==null){setLeads(data.length>0?data:demoLeads);setReady(true);return;}}try{const raw=localStorage.getItem(storageKey);setLeads(raw?JSON.parse(raw):demoLeads)}catch{setLeads(demoLeads)}setReady(true);})();},[]);
 useEffect(()=>{if(ready&&!isSupabaseConfigured)localStorage.setItem(storageKey,JSON.stringify(leads))},[leads,ready]);
 const filtered=useMemo(()=>leads.filter(l=>(status==="All"||l.status===status)&&`${l.company} ${l.niche} ${l.city}`.toLowerCase().includes(query.toLowerCase())),[leads,status,query]);
 const pipeline=leads.filter(l=>!["Won","Lost"].includes(l.status)).reduce((s,l)=>s+l.value,0); const won=leads.filter(l=>l.status==="Won").reduce((s,l)=>s+l.value,0); const contacted=leads.filter(l=>!["New","Reviewed"].includes(l.status)).length; const avg=Math.round(leads.reduce((s,l)=>s+scoreLead(l),0)/(leads.length||1));
 const saveLead=async(lead:Lead,close=true)=>{const l=lead.id?lead:{...lead,id:crypto.randomUUID(),createdAt:new Date().toISOString().slice(0,10)};setLeads(p=>p.some(x=>x.id===l.id)?p.map(x=>x.id===l.id?l:x):[l,...p]);if(isSupabaseConfigured)await dbSaveLead(l);if(close)setEditing(null);show(close?"Lead saved":"Lead updated");return l;};
 const remove=async(id:string)=>{if(confirm("Delete this lead?")){setLeads(p=>p.filter(x=>x.id!==id));setEditing(null);if(isSupabaseConfigured)await dbDeleteLead(id);show("Lead deleted")}};
 const show=(s:string)=>{setToast(s);setTimeout(()=>setToast(""),2200)};
 const importLeads=async(newLeads:Lead[])=>{const toAdd=newLeads.filter(n=>!leads.some(e=>e.placeId&&e.placeId===n.placeId));setLeads(p=>[...toAdd,...p]);if(isSupabaseConfigured)await Promise.all(toAdd.map(dbSaveLead));};
 const exportCsv=()=>{const headers=["Company","Niche","City","Website","Contact","Email","Phone","Status","Score","Deal value","Notes"];const rows=leads.map(l=>[l.company,l.niche,l.city,l.website,l.contactName,l.email,l.phone,l.status,scoreLead(l),l.value,l.notes]);const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="website-rescue-leads.csv";a.click();URL.revokeObjectURL(a.href);show("CSV exported")};
 if(!ready)return <div className="loading"><Sparkles/> Loading Website Rescue…</div>;
 return <div className="shell">
  <aside className={mobileNav?"sidebar open":"sidebar"}><div className="brand"><span className="brandmark"><Sparkles/></span><div>Website <b>Rescue</b></div><button className="mobile-close" onClick={()=>setMobileNav(false)}><X/></button></div><div className="workspace"><span>PRIVATE WORKSPACE</span><strong>My studio <ChevronDown/></strong></div><nav><button className={view==="dashboard"?"active":""} onClick={()=>{setView("dashboard");setMobileNav(false)}}><LayoutDashboard/>Dashboard</button><button className={view==="leads"?"active":""} onClick={()=>{setView("leads");setMobileNav(false)}}><Building2/>Leads <em>{leads.length}</em></button><button className={view==="find"?"active":""} onClick={()=>{setView("find");setMobileNav(false)}}><MapPin/>Find leads</button></nav><div className="side-bottom"><div className="local-note"><span><Check/></span><div><strong>Local-first</strong><small>Your data stays in this browser.</small></div></div><div className="profile"><div className="avatar">VR</div><div><strong>Website Rescue</strong><small>Private workspace</small></div><MoreHorizontal/></div></div></aside>
  <main><header><button className="menu" onClick={()=>setMobileNav(true)}><Menu/></button><div><p>PRIVATE SALES WORKSPACE</p><h1>{view==="dashboard"?"Good morning — let’s rescue a website.":view==="find"?"Find new leads":"Lead pipeline"}</h1></div><div className="header-actions"><button className="secondary" onClick={exportCsv}><Download/>Export CSV</button><button className="primary" onClick={()=>setEditing({...emptyLead})}><Plus/>Add lead</button></div></header>
    {view==="dashboard"?<Dashboard leads={leads} pipeline={pipeline} won={won} contacted={contacted} avg={avg} onView={()=>setView("leads")} onEdit={setEditing}/>:view==="find"?<FindLeads existingLeads={leads} onImport={importLeads} notify={show}/>:<Leads leads={filtered} query={query} setQuery={setQuery} status={status} setStatus={setStatus} onEdit={setEditing}/>}</main>
    {editing&&<LeadModal lead={editing} onSave={lead=>saveLead(lead,true)} onPersist={lead=>saveLead(lead,false)} onClose={()=>setEditing(null)} onDelete={editing.id?()=>remove(editing.id):undefined} notify={show}/>} {toast&&<div className="toast"><Check/>{toast}</div>}
 </div>
}

function Dashboard({leads,pipeline,won,contacted,avg,onView,onEdit}:{leads:Lead[];pipeline:number;won:number;contacted:number;avg:number;onView:()=>void;onEdit:(l:Lead)=>void}){
 const counts=statuses.map(s=>({s,n:leads.filter(l=>l.status===s).length})); const max=Math.max(...counts.map(x=>x.n),1); const priority=[...leads].filter(l=>!["Won","Lost"].includes(l.status)).sort((a,b)=>scoreLead(b)-scoreLead(a)).slice(0,4);
 return <div className="content"><section className="metrics"><Metric icon={<Target/>} label="Active leads" value={String(leads.filter(l=>!["Won","Lost"].includes(l.status)).length)} detail={`${leads.length} total prospects`} tone="purple"/><Metric icon={<CircleDollarSign/>} label="Pipeline value" value={money(pipeline)} detail={`${money(won)} already won`} tone="green"/><Metric icon={<Mail/>} label="Outreach sent" value={String(contacted)} detail={`${Math.round(contacted/(leads.length||1)*100)}% of all leads`} tone="blue"/><Metric icon={<Gauge/>} label="Avg. rescue score" value={`${avg}/100`} detail="Higher means more opportunity" tone="orange"/></section>
 <section className="dashboard-grid"><div className="panel chart"><div className="panel-title"><div><p>PIPELINE</p><h2>Lead momentum</h2></div><button onClick={onView}>View all <ArrowUpRight/></button></div><div className="bars">{counts.map(({s,n})=><div className="bar-col" key={s}><div className="bar-track"><div className="bar-fill" style={{height:`${Math.max(n/max*100,n?18:3)}%`}}><span>{n}</span></div></div><small>{s}</small></div>)}</div></div>
 <div className="panel opportunity"><p>THIS WEEK’S OPPORTUNITY</p><div className="opportunity-icon"><BarChart3/></div><h2>{money(priority.reduce((s,l)=>s+l.value,0))}</h2><span>in high-priority leads</span><hr/><small>Focus on prospects scoring over 60. They have visible problems and a clear reason to buy.</small></div></section>
 <section className="panel recent"><div className="panel-title"><div><p>PRIORITY QUEUE</p><h2>Best rescue opportunities</h2></div><button onClick={onView}>Open pipeline <ArrowUpRight/></button></div><div className="lead-table"><div className="tr th"><span>COMPANY</span><span>RESCUE SCORE</span><span>STATUS</span><span>VALUE</span><span></span></div>{priority.map(l=><LeadRow key={l.id} lead={l} onEdit={onEdit}/>)}</div></section></div>
}
function Metric({icon,label,value,detail,tone}:{icon:React.ReactNode;label:string;value:string;detail:string;tone:string}){return <div className="metric"><div className={`metric-icon ${tone}`}>{icon}</div><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></div>}
function Leads({leads,query,setQuery,status,setStatus,onEdit}:{leads:Lead[];query:string;setQuery:(s:string)=>void;status:string;setStatus:(s:string)=>void;onEdit:(l:Lead)=>void}){return <div className="content"><div className="lead-head"><div><p>Find the businesses most likely to say yes.</p></div><div className="filters"><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search leads…"/></label><select value={status} onChange={e=>setStatus(e.target.value)}><option>All</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></div></div><section className="panel recent full"><div className="lead-table"><div className="tr th"><span>COMPANY</span><span>RESCUE SCORE</span><span>STATUS</span><span>VALUE</span><span></span></div>{leads.map(l=><LeadRow key={l.id} lead={l} onEdit={onEdit}/>)}{!leads.length&&<div className="empty"><Search/><h3>No leads found</h3><p>Try a different search or filter.</p></div>}</div></section></div>}
function LeadRow({lead,onEdit}:{lead:Lead;onEdit:(l:Lead)=>void}){const score=scoreLead(lead);return <button className="tr data" onClick={()=>onEdit(lead)}><span className="company"><i>{lead.company.slice(0,2).toUpperCase()}</i><span><strong>{lead.company}</strong><small>{lead.niche} · {lead.city}</small></span></span><span className="score"><b>{score}</b><i><u style={{width:`${score}%`}}/></i></span><span><em className={statusClass(lead.status)}>{lead.status}</em></span><span className="value">{money(lead.value)}</span><span><ArrowUpRight/></span></button>}

function LeadModal({lead,onSave,onPersist,onClose,onDelete,notify}:{lead:Lead;onSave:(l:Lead)=>void|Promise<unknown>;onPersist:(l:Lead)=>void|Promise<unknown>;onClose:()=>void;onDelete?:()=>void;notify:(s:string)=>void}) {
  const [form, setForm] = useState(lead);
  const [tab, setTab] = useState<"details" | "outreach">("details");
  const [isEditing, setIsEditing] = useState(false);
  const [outreachDraft, setOutreachDraft] = useState(buildOutreachDraft(lead));

  useEffect(() => {
    const latestVersion = lead.outreachVersions?.[lead.outreachVersions.length - 1]?.body;
    setForm(lead);
    setTab("details");
    setIsEditing(false);
    setOutreachDraft(lead.outreachCurrent ?? latestVersion ?? buildOutreachDraft(lead));
  }, [lead]);

  const set = (k: keyof Lead, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const issues = (Object.keys(form.issues) as (keyof Lead["issues"])[]).filter(k => form.issues[k]);
  const a = form.analysis;
  const specificIssues: string[] = [];

  if (a) {
    if (!a.hasHttps) specificIssues.push("no SSL certificate");
    if (!a.blocked && !a.hasMobileViewport) specificIssues.push("isn't optimized for mobile");
    if (a.responseTimeMs && a.responseTimeMs > 3000) specificIssues.push(`loads slowly (${(a.responseTimeMs / 1000).toFixed(1)}s)`);
    if (!a.blocked && !a.hasCTA) specificIssues.push("has no clear call to action");
    if (!a.blocked && !a.hasBooking) specificIssues.push("offers no online booking");
  } else if (!form.website) {
    specificIssues.push("has no website at all");
  }

  const issueText = specificIssues.length
    ? specificIssues.slice(0, 3).join(", ")
    : issues.length
      ? issues.slice(0, 3).map(k => issueLabels[k].toLowerCase()).join(", ")
      : null;

  const ratingLine = form.rating ? `You have ${form.rating} stars on Google — customers clearly trust you. ` : "";
  const generatedLetter = `Subject: Quick idea for ${form.company || "your website"}\n\nHi ${form.contactName || "there"},\n\n${ratingLine}I took a look at ${form.company || "your website"}${form.city ? ` (${form.niche || "business"} in ${form.city})` : ""}${issueText ? ` and noticed some issues: ${issueText}` : " and spotted a few things that could be improved"}. That may be costing you inquiries and calls.\n\nI design clean, fast websites for ${form.niche || "local businesses"} that turn visitors into customers. Would you be open to a quick concept? No pressure — I'd be happy to send it over for free.\n\nBest,\n[Your name]\nWebsite Rescue`;
  const letter = outreachDraft || generatedLetter;
  const statusIndex = Math.max(0, statuses.indexOf(form.status));

  const commitStatus = async (status: LeadStatus) => {
    const next = { ...form, status };
    setForm(next);
    await onPersist(next);
    notify(`Status set to ${status}`);
  };

  const saveLead = async () => {
    await onSave({ ...form, outreachCurrent: letter, outreachVersions: form.outreachVersions ?? [] });
  };

  const saveOutreachVersion = async () => {
    const version = { body: letter, createdAt: new Date().toISOString() };
    const next = { ...form, outreachCurrent: letter, outreachVersions: [...(form.outreachVersions ?? []), version] };
    setForm(next);
    await onPersist(next);
    notify("Outreach version saved");
  };

  const restoreVersion = (body: string) => setOutreachDraft(body);

  return (
    <div className="modal-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal lead-modal">
        <div className="modal-head">
          <div>
            <p>{form.id ? "LEAD DETAILS" : "NEW OPPORTUNITY"}</p>
            <h2>{form.company || "Add a lead"}</h2>
          </div>
          <div className="lead-modal-actions">
            {!isEditing ? <button className="secondary" onClick={() => setIsEditing(true)}><Edit3 />Edit lead</button> : <button className="secondary" onClick={() => setIsEditing(false)}><Save />View</button>}
            <button onClick={onClose}><X /></button>
          </div>
        </div>

        <div className="tabs">
          <button className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Lead details</button>
          <button className={tab === "outreach" ? "active" : ""} onClick={() => setTab("outreach")}><Sparkles />Personalized outreach</button>
        </div>

        {tab === "details" ? (
          <div className="form">
            <div className="lead-status-flow">
              <div className="lead-status-steps">
                {statuses.map((step, index) => (
                  <button
                    key={step}
                    className={index === statusIndex ? "active" : index < statusIndex ? "done" : ""}
                    onClick={() => void commitStatus(step)}
                  >
                    <span>{index + 1}</span>
                    {step}
                  </button>
                ))}
              </div>
              <div className="lead-status-nav">
                <button className="secondary" onClick={() => statusIndex > 0 && void commitStatus(statuses[statusIndex - 1])} disabled={statusIndex === 0}><ChevronLeft />Prev</button>
                <button className="secondary" onClick={() => statusIndex < statuses.length - 1 && void commitStatus(statuses[statusIndex + 1])} disabled={statusIndex === statuses.length - 1}>Next<ChevronRight /></button>
              </div>
            </div>

            {isEditing ? (
              <>
                <div className="form-grid">
                  <Field label="Company *"><input value={form.company} onChange={e => set("company", e.target.value)} placeholder="Acme Dental" /></Field>
                  <Field label="Niche"><input value={form.niche} onChange={e => set("niche", e.target.value)} placeholder="Dentist" /></Field>
                  <Field label="City"><input value={form.city} onChange={e => set("city", e.target.value)} placeholder="San Jose, CA" /></Field>
                  <Field label="Website"><input value={form.website} onChange={e => set("website", e.target.value)} placeholder="example.com" /></Field>
                  <Field label="Contact name"><input value={form.contactName} onChange={e => set("contactName", e.target.value)} placeholder="Alex" /></Field>
                  <Field label="Email"><input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="alex@example.com" /></Field>
                  <Field label="Phone"><input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000" /></Field>
                  <Field label="Potential value ($)"><input type="number" value={form.value} onChange={e => set("value", Number(e.target.value))} /></Field>
                </div>
                <Field label="Website issues">
                  <div className="issues">
                    {(Object.keys(issueLabels) as (keyof Lead["issues"])[]).map(k => (
                      <label key={k} className={form.issues[k] ? "checked" : ""}>
                        <input type="checkbox" checked={form.issues[k]} onChange={e => setForm(f => ({ ...f, issues: { ...f.issues, [k]: e.target.checked } }))} />
                        <span><Check /></span>
                        {issueLabels[k]}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Notes"><textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Follow-up details, objections, next steps…" /></Field>
              </>
            ) : (
              <div className="lead-summary">
                <div className="lead-summary-grid">
                  <div><span>Website</span>{form.websiteUrl ? <a href={form.websiteUrl} target="_blank" rel="noreferrer"><ArrowUpRight />Visit site</a> : <strong>—</strong>}</div>
                  <div><span>Website score</span><strong>{scoreLead(form)}/100</strong></div>
                  <div><span>Contact</span><strong>{form.contactName || "—"}</strong><small>{form.email || form.phone || "No contact added"}</small></div>
                  <div><span>Location</span><strong>{form.city || "—"}</strong><small>{form.formattedAddress || form.niche || "Lead details"}</small></div>
                </div>
                <div className="lead-issue-row">
                  {issueText ? issueText.split(", ").map(item => <span key={item} className="find-issue-tag">{item}</span>) : <span className="muted">No captured issues yet.</span>}
                </div>
                <div className="lead-summary-notes">
                  <span>Notes</span>
                  <p>{form.notes || "No notes yet."}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="outreach">
            <div className="outreach-intro">
              <span><Sparkles /></span>
              <div>
                <h3>Personalized outreach</h3>
                <p>Edit the message and save a new version to this lead.</p>
              </div>
            </div>

            <textarea value={letter} onChange={e => setOutreachDraft(e.target.value)} />

            <div className="outreach-actions">
              <button className="secondary" onClick={() => void navigator.clipboard.writeText(letter)}><Copy />Copy email</button>
              <button className="secondary" onClick={() => void saveOutreachVersion()}><Save />Save version</button>
            </div>

            {!!(form.outreachVersions?.length) && (
              <div className="outreach-history">
                <strong>Saved versions</strong>
                <div className="outreach-history-list">
                  {[...(form.outreachVersions ?? [])].slice().reverse().map(version => (
                    <button key={version.createdAt} type="button" onClick={() => restoreVersion(version.body)}>
                      <span>{new Date(version.createdAt).toLocaleString()}</span>
                      <small>Restore</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="modal-foot">
          {onDelete && <button className="danger" onClick={onDelete}><Trash2 />Delete</button>}
          <span />
          <button className="secondary" onClick={onClose}>Cancel</button>
          {isEditing
            ? <button className="primary" disabled={!form.company.trim()} onClick={() => void saveLead()}><Check />Save lead</button>
            : <button className="primary" onClick={() => setIsEditing(true)}><Edit3 />Edit lead</button>}
        </div>
      </div>
    </div>
  );
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
