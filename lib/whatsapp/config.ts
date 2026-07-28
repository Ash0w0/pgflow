import {
  getPgflowEnvironment,
  getPgflowRuntime,
  getWhatsAppSendMode,
} from "../runtime.ts";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value === "replace_me") {
    throw new Error(`${name} is required for WhatsApp delivery.`);
  }
  return value;
}

export type WhatsAppConfig = {
  runtime: "production" | "demo";
  environment: "local" | "staging" | "production";
  sendMode: "disabled" | "allowlist" | "live";
  accessToken?: string;
  phoneNumberId?: string;
  wabaId?: string;
  appSecret?: string;
  verifyToken?: string;
  workerSecret?: string;
  graphVersion: string;
  allowlist: Set<string>;
};

export function getWhatsAppConfig(): WhatsAppConfig {
  const runtime = getPgflowRuntime();
  const sendMode = getWhatsAppSendMode();
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v23.0";
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error("WHATSAPP_GRAPH_VERSION must be pinned, for example v23.0.");
  }

  const allowlist = new Set(
    (process.env.WHATSAPP_TEST_RECIPIENTS ?? "")
      .split(",")
      .map((phone) => phone.trim().replace(/^\+/, ""))
      .filter(Boolean),
  );

  if (runtime === "production" && sendMode !== "disabled") {
    return {
      runtime,
      environment: getPgflowEnvironment(),
      sendMode,
      accessToken: required("WHATSAPP_ACCESS_TOKEN"),
      phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
      wabaId: required("WHATSAPP_WABA_ID"),
      appSecret: required("WHATSAPP_APP_SECRET"),
      verifyToken: required("WHATSAPP_VERIFY_TOKEN"),
      workerSecret: required("WHATSAPP_WORKER_SECRET"),
      graphVersion,
      allowlist,
    };
  }

  return {
    runtime,
    environment: getPgflowEnvironment(),
    sendMode,
    graphVersion,
    allowlist,
  };
}

export function requireWebhookConfig() {
  const config = getWhatsAppConfig();
  if (config.runtime === "demo") return config;
  return {
    ...config,
    appSecret: config.appSecret ?? required("WHATSAPP_APP_SECRET"),
    verifyToken: config.verifyToken ?? required("WHATSAPP_VERIFY_TOKEN"),
  };
}

export function requireWorkerRequest(request: Request) {
  const configured = required("WHATSAPP_WORKER_SECRET");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (configured.length !== supplied.length) return false;
  let difference = 0;
  for (let index = 0; index < configured.length; index += 1) {
    difference |= configured.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return difference === 0;
}
