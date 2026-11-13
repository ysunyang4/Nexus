import React, { useState, useEffect } from "react";
import {
  Globe,
  Plus,
  RotateCw,
  ExternalLink,
  Trash2,
  Check,
  Loader2,
  Plug,
  Unplug,
  Key,
  Mail,
  Coins,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation.js";
import {
  remoteMcpApi,
  type RemoteMcpStateDto,
  type RemoteMcpAccountProfileDto,
} from "../../api/remote-mcp-api.js";
import { openExternalUrl } from "../../api/browser-helper.js";

export const RemoteMcpPage: React.FC = () => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");

  const [services, setServices] = useState<RemoteMcpStateDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({ "hcti-image": true });

  // Add Service Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newEndpoint, setNewEndpoint] = useState("https://mcp.hcti.io");
  const [newWebsite, setNewWebsite] = useState("https://htmlcsstoimage.com");
  const [newDesc, setNewDesc] = useState("");
  const [initialToken, setInitialToken] = useState("");
  const [initialEmail, setInitialEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Account sub-form inside card
  const [addingAccountFor, setAddingAccountFor] = useState<string | null>(null);
  const [newAccLabel, setNewAccLabel] = useState("");
  const [newAccToken, setNewAccToken] = useState("");
  const [newAccQuota, setNewAccQuota] = useState("");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const list = await remoteMcpApi.listServices();
      setServices(list);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const list = await remoteMcpApi.listServices();
        setServices(list);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async (id: string) => {
    const svc = services.find((s) => s.config.id === id);
    const activeAcc = svc?.config.accounts.find((a) => a.isActive);
    if (!activeAcc?.token) {
      const openNow = window.confirm(
        isZh
          ? `当前激活账号尚未填写 API Key / Token。\n\n该云端服务需要登录凭据。是否立即打开系统浏览器前往官网【${svc?.config.name || "官网"}】注册登录以获取体验金密钥？`
          : "No API Key configured. Open browser to sign up now?"
      );
      if (openNow && svc?.config.websiteUrl) {
        await handleOpenBrowser(svc.config.websiteUrl);
      }
      setExpandedAccounts((prev) => ({ ...prev, [id]: true }));
      setAddingAccountFor(id);
      return;
    }

    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await remoteMcpApi.connectService(id);
      if (!res.success) {
        // Will be displayed in error banner with browser action button
      }
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleDisconnect = async (id: string) => {
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await remoteMcpApi.disconnectService(id);
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleDeleteService = async (id: string, name: string) => {
    if (!window.confirm(isZh ? `确定要移除云端服务 "${name}" 吗？` : `Are you sure to remove "${name}"?`)) {
      return;
    }
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await remoteMcpApi.deleteService(id);
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleAddAccount = async (serviceId: string) => {
    if (!newAccToken.trim()) {
      alert(isZh ? "请填写 API Key 或 Token" : "Please input API Key or Token");
      return;
    }
    setActionBusy((prev) => ({ ...prev, [serviceId]: true }));
    try {
      const res = await remoteMcpApi.addAccount(serviceId, {
        accountLabel: newAccLabel.trim() || (isZh ? "新账号" : "New Account"),
        token: newAccToken.trim(),
        quotaNote: newAccQuota.trim() || undefined,
      });
      if (res.success) {
        setAddingAccountFor(null);
        setNewAccLabel("");
        setNewAccToken("");
        setNewAccQuota("");
        await loadData();
      } else {
        alert(res.error || (isZh ? "添加失败" : "Failed to add account"));
      }
    } finally {
      setActionBusy((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const handleDeleteAccount = async (serviceId: string, accountId: string, label: string) => {
    if (!window.confirm(isZh ? `确定要移除账号 "${label}" 吗？此操作无法撤销。` : `Are you sure to remove account "${label}"?`)) {
      return;
    }
    setActionBusy((prev) => ({ ...prev, [serviceId]: true }));
    try {
      const res = await remoteMcpApi.deleteAccount(serviceId, accountId);
      if (res.success) {
        await loadData();
      } else {
        alert(res.error || (isZh ? "删除失败" : "Failed to delete account"));
      }
    } finally {
      setActionBusy((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const handleActivateAccount = async (serviceId: string, accountId: string) => {
    setActionBusy((prev) => ({ ...prev, [serviceId]: true }));
    try {
      const res = await remoteMcpApi.activateAccount(serviceId, accountId);
      if (res.success) {
        await loadData();
      } else {
        alert(res.error || (isZh ? "激活失败" : "Failed to activate account"));
      }
    } finally {
      setActionBusy((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId.trim() || !newEndpoint.trim()) return;
    setIsSubmitting(true);
    setAddError(null);
    try {
      const accounts: RemoteMcpAccountProfileDto[] = [];
      if (initialToken.trim()) {
        accounts.push({
          id: `acc_${Date.now()}`,
          accountLabel: initialEmail.trim() || (isZh ? "主账号" : "Primary Account"),
          token: initialToken.trim(),
          quotaNote: isZh ? "初始注册体验金" : "Initial trial quota",
          isActive: true,
          createdAt: Date.now(),
        });
      }

      const res = await remoteMcpApi.createService({
        id: newId.trim().toLowerCase(),
        name: newName.trim() || newId.trim(),
        description: newDesc.trim() || undefined,
        websiteUrl: newWebsite.trim() || undefined,
        endpoint: newEndpoint.trim(),
        transport: "streamableHttp",
        accounts,
      });

      if (res.success) {
        setShowAddModal(false);
        setNewId("");
        setNewName("");
        setNewEndpoint("https://");
        setNewWebsite("");
        setNewDesc("");
        setInitialToken("");
        setInitialEmail("");
        await loadData();
      } else {
        setAddError(res.error || "创建失败");
      }
    } catch (err: any) {
      setAddError(err.message || String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenBrowser = async (url: string) => {
    if (!url) return;
    await openExternalUrl(url);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-y-auto p-6 space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-theme-subtle pb-4">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-400" />
            <span>{isZh ? "云端与远程 MCP 服务 (Remote & Cloud MCP)" : "Remote & Cloud MCP Services"}</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "免本地安装运行：直接接入 MCP.so 等云端服务，支持多邮箱多账号轮换与体验金配额管理"
              : "Zero local installation: connect to hosted MCP servers (e.g. MCP.so), manage multi-account tokens and quota"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="p-1.5 rounded text-theme-muted hover:text-theme-primary bg-theme-card border border-theme-subtle"
            title="刷新"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isZh ? "+ 接入云端 MCP" : "+ Add Remote MCP"}</span>
          </button>
        </div>
      </div>

      {/* Services List */}
      <div className="space-y-4">
        {services.map((svc) => {
          const isBusy = actionBusy[svc.config.id];
          const isConnected = svc.status === "CONNECTED";
          const isConnecting = svc.status === "CONNECTING";
          const isError = svc.status === "ERROR";
          const isAccountsOpen = expandedAccounts[svc.config.id];
          const activeAccount = svc.config.accounts.find((a) => a.isActive);

          return (
            <div
              key={svc.config.id}
              className="p-5 rounded-xl border border-theme-subtle bg-theme-card/30 space-y-4 shadow-sm"
            >
              {/* Card Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-theme-subtle/50 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-theme-primary">{svc.config.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        {svc.config.id}
                      </span>
                      {svc.config.websiteUrl && (
                        <button
                          type="button"
                          onClick={() => handleOpenBrowser(svc.config.websiteUrl!)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 text-xs font-semibold transition cursor-pointer shadow-xs"
                          title={isZh ? "在系统浏览器中打开注册登录以获取体验金" : "Open in system browser to register"}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{isZh ? "官网注册登录 ↗" : "Website Register / Login ↗"}</span>
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-theme-muted mt-0.5 flex items-center gap-3">
                      <span>云端端点: <strong className="text-theme-secondary">{svc.config.endpoint}</strong></span>
                      <span>当前账号: <strong className="text-amber-400">{activeAccount ? activeAccount.accountLabel : (isZh ? "未绑定" : "None")}</strong></span>
                      <span>工具数: <strong className="text-sky-400">{svc.toolCount} Tools</strong></span>
                    </div>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border ${
                      isConnected
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : isConnecting
                        ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                        : isError
                        ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                        : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isConnected ? "bg-emerald-400 animate-pulse" : isConnecting ? "bg-sky-400 animate-ping" : isError ? "bg-rose-400" : "bg-zinc-500"
                      }`}
                    />
                    <span>
                      {isConnected
                        ? isZh ? "已挂载 (Connected)" : "CONNECTED"
                        : isConnecting
                        ? isZh ? "连接中..." : "CONNECTING"
                        : isError
                        ? isZh ? "连接异常 (Error)" : "ERROR"
                        : isZh ? "未连接 (Disconnected)" : "DISCONNECTED"}
                    </span>
                  </span>

                  {/* Connect / Disconnect */}
                  {isConnected ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDisconnect(svc.config.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/40 rounded-lg text-xs font-semibold transition"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                      <span>{isZh ? "断开" : "Disconnect"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleConnect(svc.config.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                      <span>{isZh ? "挂载连接" : "Connect"}</span>
                    </button>
                  )}

                  {/* Account Manager Toggle */}
                  <button
                    type="button"
                    onClick={() => setExpandedAccounts((prev) => ({ ...prev, [svc.config.id]: !prev[svc.config.id] }))}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                      isAccountsOpen
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : "bg-theme-card text-theme-muted hover:text-theme-primary border-theme-subtle"
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isZh ? `多账号与配额 (${svc.config.accounts.length})` : `Accounts (${svc.config.accounts.length})`}</span>
                    {isAccountsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>

                  {/* Delete Service */}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDeleteService(svc.config.id, svc.config.name)}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition"
                    title={isZh ? "移除服务" : "Remove Service"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Description */}
              {svc.config.description && (
                <p className="text-xs text-theme-muted leading-relaxed">
                  {svc.config.description}
                </p>
              )}

              {/* Error Banner */}
              {isError && svc.lastError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-2.5">
                  <div className="flex items-start gap-2">
                    <span className="text-sm">⚠️</span>
                    <span className="flex-1 font-sans font-medium">{svc.lastError}</span>
                  </div>
                  {svc.config.websiteUrl && (
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenBrowser(svc.config.websiteUrl!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{isZh ? "🌐 立即打开浏览器前往官网注册登录 ↗" : "🌐 Open Browser to Register / Login ↗"}</span>
                      </button>
                      <span className="text-[11px] text-theme-muted">
                        {isZh ? "获取 API Key 后在下方填入账号即可正常挂载" : "Paste API Key below after signing up"}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Multi-Account & Quota Profile Manager */}
              {isAccountsOpen && (
                <div className="p-4 rounded-xl bg-theme-base/60 border border-theme-subtle space-y-3">
                  <div className="flex items-center justify-between border-b border-theme-subtle/50 pb-2">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-amber-400" />
                      <h3 className="text-xs font-bold text-theme-primary">
                        {isZh ? "多邮箱账号与赠送额度轮换 (Multi-Account Token Profiles)" : "Account Profiles & Quota Management"}
                      </h3>
                    </div>
                    <span className="text-[11px] text-theme-muted">
                      {isZh ? "随时切换当前使用的账号 Token，或移除已无额度的旧账号" : "Switch active token or remove exhausted accounts"}
                    </span>
                  </div>

                  {/* Account List */}
                  <div className="space-y-2">
                    {svc.config.accounts.map((acc) => (
                      <div
                        key={acc.id}
                        className={`p-3 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs transition ${
                          acc.isActive
                            ? "bg-amber-500/10 border-amber-500/40 text-theme-primary"
                            : "bg-theme-card/30 border-theme-subtle text-theme-muted hover:border-theme-subtle/80"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-sky-400" />
                            <span className="font-semibold text-theme-primary">{acc.accountLabel}</span>
                            {acc.isActive ? (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                <span>{isZh ? "当前激活生效" : "ACTIVE"}</span>
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                                {isZh ? "待用" : "STANDBY"}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-theme-muted flex items-center gap-3">
                            <span>Key: <code className="text-zinc-300 font-mono">{acc.token || (isZh ? "无 Token (公开服务)" : "None")}</code></span>
                            {acc.quotaNote && (
                              <span>额度备注: <strong className="text-amber-400">{acc.quotaNote}</strong></span>
                            )}
                          </div>
                        </div>

                        {/* Account Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {!acc.isActive && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleActivateAccount(svc.config.id, acc.id)}
                              className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] transition shadow-xs"
                            >
                              {isZh ? "切换为此账号" : "Activate"}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDeleteAccount(svc.config.id, acc.id, acc.accountLabel)}
                            className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition"
                            title={isZh ? "移除此账号 (没额度时删除)" : "Remove Account"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {svc.config.accounts.length === 0 && (
                      <div className="p-3 text-center text-xs text-theme-muted bg-theme-card/20 rounded-lg">
                        {isZh ? "暂无账号，点击下方【+ 添加新账号 Profile】添加你的邮箱 API Key" : "No accounts yet."}
                      </div>
                    )}
                  </div>

                  {/* Add Account Inline Form */}
                  {addingAccountFor === svc.config.id ? (
                    <div className="p-3 rounded-lg bg-theme-card/60 border border-theme-subtle space-y-3 mt-2 text-xs">
                      <div className="font-semibold text-theme-primary flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-sky-400" />
                        <span>{isZh ? "添加新邮箱账号 / Token Profile" : "Add Account Profile"}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder={isZh ? "账号备注 (如: personal@163.com)" : "Account Label / Email"}
                          value={newAccLabel}
                          onChange={(e) => setNewAccLabel(e.target.value)}
                          className="p-2 bg-theme-base border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                        />
                        <input
                          type="password"
                          placeholder={isZh ? "API Key 或 Access Token" : "API Key or Access Token"}
                          value={newAccToken}
                          onChange={(e) => setNewAccToken(e.target.value)}
                          className="p-2 bg-theme-base border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                        />
                        <input
                          type="text"
                          placeholder={isZh ? "额度备注 (如: 赠送 $5 体验金)" : "Quota Note (e.g. $5 Free Credits)"}
                          value={newAccQuota}
                          onChange={(e) => setNewAccQuota(e.target.value)}
                          className="p-2 bg-theme-base border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setAddingAccountFor(null)}
                          className="px-3 py-1 rounded bg-theme-base border border-theme-subtle text-theme-muted hover:text-theme-primary"
                        >
                          {isZh ? "取消" : "Cancel"}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAddAccount(svc.config.id)}
                          className="px-3.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-xs"
                        >
                          {isZh ? "保存并添加账号" : "Save Account"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-1 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingAccountFor(svc.config.id);
                          setNewAccLabel("");
                          setNewAccToken("");
                          setNewAccQuota(isZh ? "赠送体验额度" : "Free Trial Credits");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-theme-card hover:bg-theme-card/80 border border-theme-subtle text-sky-400 text-xs font-medium transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isZh ? "+ 添加新邮箱账号 / Token Profile" : "+ Add Account Profile"}</span>
                      </button>

                      {svc.config.websiteUrl && (
                        <button
                          type="button"
                          onClick={() => handleOpenBrowser(svc.config.websiteUrl!)}
                          className="text-[11px] text-theme-muted hover:text-sky-400 flex items-center gap-1"
                        >
                          <span>{isZh ? "去官网新注册邮箱领取体验金 ↗" : "Get Free Credits on Official Site ↗"}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {services.length === 0 && !isLoading && (
          <div className="p-8 text-center text-xs text-theme-muted bg-theme-card/20 border border-theme-subtle rounded-xl">
            {isZh ? "暂无云端 MCP 服务，点击右上角【+ 接入云端 MCP】添加" : "No remote MCP services."}
          </div>
        )}
      </div>

      {/* Add Remote MCP Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-mono">
          <div className="w-full max-w-lg bg-theme-base border border-theme-subtle rounded-xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
              <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-400" />
                <span>{isZh ? "接入云端与远程 MCP 服务" : "Add Remote MCP Service"}</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-theme-muted hover:text-theme-primary text-xs">
                ✕
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 text-xs">
                {addError}
              </div>
            )}

            <form onSubmit={handleCreateService} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-theme-muted block">{isZh ? "服务 ID (唯一英文标识)" : "Service ID"}</label>
                <input
                  type="text"
                  required
                  placeholder="例如: htmlcsstoimage 或 my-cloud-tool"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted block">{isZh ? "显示名称" : "Display Name"}</label>
                <input
                  type="text"
                  placeholder="例如: HTML/CSS to Image (MCP.so)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted block">{isZh ? "远程 MCP 连接端点 (URL)" : "Remote Endpoint URL"}</label>
                <input
                  type="url"
                  required
                  placeholder="例如: https://mcp.hcti.io"
                  value={newEndpoint}
                  onChange={(e) => setNewEndpoint(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted block">{isZh ? "官方网站登录注册地址 (选填，方便换号注册)" : "Official Website URL"}</label>
                <input
                  type="url"
                  placeholder="例如: https://htmlcsstoimage.com"
                  value={newWebsite}
                  onChange={(e) => setNewWebsite(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted block">{isZh ? "初始账号邮箱与 Token (选填，后续可在多账号中添加)" : "Initial Token"}</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="邮箱或账号标签"
                    value={initialEmail}
                    onChange={(e) => setInitialEmail(e.target.value)}
                    className="p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                  />
                  <input
                    type="password"
                    placeholder="API Key / Token"
                    value={initialToken}
                    onChange={(e) => setInitialToken(e.target.value)}
                    className="p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-theme-subtle">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded text-theme-muted hover:text-theme-primary bg-theme-card border border-theme-subtle"
                >
                  {isZh ? "取消" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? (isZh ? "正在接入..." : "Connecting...") : (isZh ? "完成并接入" : "Add Service")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
