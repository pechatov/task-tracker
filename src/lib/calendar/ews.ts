import { XMLParser } from "fast-xml-parser";

export type EwsCredentials = {
  password: string;
  serverUrl: string;
  username: string;
};

export type EwsCalendarFolder = {
  id: string;
  changeKey?: string;
  displayName?: string;
};

export type EwsCalendarItem = {
  id: string;
  subject?: string;
  start?: string;
  end?: string;
  isAllDay?: boolean;
  location?: string;
  organizerName?: string;
  displayTo?: string;
  lastModified?: string;
};

const soapEnvelopeStart =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"' +
  ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"' +
  ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">' +
  "<soap:Header>" +
  '<t:RequestServerVersion Version="Exchange2013_SP1"/>' +
  "</soap:Header>" +
  "<soap:Body>";

const soapEnvelopeEnd = "</soap:Body></soap:Envelope>";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false
});

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// fast-xml-parser returns objects with unknown shapes; navigate defensively.
type XmlNode = Record<string, unknown>;

function asNode(value: unknown): XmlNode {
  return typeof value === "object" && value !== null ? (value as XmlNode) : {};
}

function assertSuccessResponse(message: XmlNode, operation: string) {
  if (message["@_ResponseClass"] === "Success") {
    return;
  }

  const code = asText(message.ResponseCode) ?? "unknown error";
  throw new Error(`EWS ${operation} failed: ${code}`);
}

export function normalizeEwsServerUrl(rawUrl: string) {
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  return /\.asmx$/i.test(withScheme)
    ? withScheme
    : `${withScheme}/EWS/Exchange.asmx`;
}

async function callEws(credentials: EwsCredentials, body: string) {
  const authorization = Buffer.from(
    `${credentials.username}:${credentials.password}`
  ).toString("base64");
  const response = await fetch(credentials.serverUrl, {
    method: "POST",
    headers: {
      authorization: `Basic ${authorization}`,
      "content-type": "text/xml; charset=utf-8"
    },
    body: `${soapEnvelopeStart}${body}${soapEnvelopeEnd}`
  });

  if (response.status === 401) {
    throw new Error("EWS authentication failed: check username and password");
  }

  if (!response.ok) {
    throw new Error(`EWS request failed: ${response.status}`);
  }

  return response.text();
}

export function parseEwsDefaultCalendarFolderId(xml: string) {
  const message = asNode(
    asNode(
      asNode(asNode(asNode(asNode(xmlParser.parse(xml)).Envelope).Body).GetFolderResponse)
        .ResponseMessages
    ).GetFolderResponseMessage
  );
  assertSuccessResponse(message, "GetFolder");

  const folder = asNode(asNode(asNode(message.Folders).CalendarFolder).FolderId);

  return asText(folder["@_Id"]);
}

export function parseEwsCalendarFolders(xml: string): EwsCalendarFolder[] {
  const message = asNode(
    asNode(
      asNode(asNode(asNode(asNode(xmlParser.parse(xml)).Envelope).Body).FindFolderResponse)
        .ResponseMessages
    ).FindFolderResponseMessage
  );
  assertSuccessResponse(message, "FindFolder");

  const folders = asArray(
    asNode(asNode(message.RootFolder).Folders).CalendarFolder
  );

  return folders.flatMap((entry) => {
    const folder = asNode(entry);
    const folderId = asNode(folder.FolderId);
    const id = asText(folderId["@_Id"]);

    if (!id) {
      return [];
    }

    return [
      {
        id,
        changeKey: asText(folderId["@_ChangeKey"]),
        displayName: asText(folder.DisplayName)
      }
    ];
  });
}

export function parseEwsCalendarItems(xml: string): EwsCalendarItem[] {
  const message = asNode(
    asNode(
      asNode(asNode(asNode(asNode(xmlParser.parse(xml)).Envelope).Body).FindItemResponse)
        .ResponseMessages
    ).FindItemResponseMessage
  );
  assertSuccessResponse(message, "FindItem");

  const items = asArray(asNode(asNode(message.RootFolder).Items).CalendarItem);

  return items.flatMap((entry) => {
    const item = asNode(entry);
    const id = asText(asNode(item.ItemId)["@_Id"]);

    if (!id) {
      return [];
    }

    return [
      {
        id,
        subject: asText(item.Subject),
        start: asText(item.Start),
        end: asText(item.End),
        isAllDay: asText(item.IsAllDayEvent) === "true",
        location: asText(item.Location),
        organizerName:
          asText(asNode(asNode(item.Organizer).Mailbox).Name) ??
          asText(asNode(asNode(item.Organizer).Mailbox).EmailAddress),
        displayTo: asText(item.DisplayTo),
        lastModified: asText(item.LastModifiedTime)
      }
    ];
  });
}

export async function fetchEwsDefaultCalendarFolderId(
  credentials: EwsCredentials
) {
  const xml = await callEws(
    credentials,
    "<m:GetFolder>" +
      "<m:FolderShape><t:BaseShape>IdOnly</t:BaseShape></m:FolderShape>" +
      '<m:FolderIds><t:DistinguishedFolderId Id="calendar"/></m:FolderIds>' +
      "</m:GetFolder>"
  );

  return parseEwsDefaultCalendarFolderId(xml);
}

export async function fetchEwsCalendarFolders(credentials: EwsCredentials) {
  const xml = await callEws(
    credentials,
    '<m:FindFolder Traversal="Deep">' +
      "<m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape>" +
      "<m:Restriction><t:IsEqualTo>" +
      '<t:FieldURI FieldURI="folder:FolderClass"/>' +
      '<t:FieldURIOrConstant><t:Constant Value="IPF.Appointment"/></t:FieldURIOrConstant>' +
      "</t:IsEqualTo></m:Restriction>" +
      '<m:ParentFolderIds><t:DistinguishedFolderId Id="msgfolderroot"/></m:ParentFolderIds>' +
      "</m:FindFolder>"
  );

  return parseEwsCalendarFolders(xml);
}

export async function fetchEwsCalendarItems(
  credentials: EwsCredentials,
  folderId: string,
  window: { startsAt: Date; endsAt: Date }
) {
  const xml = await callEws(
    credentials,
    '<m:FindItem Traversal="Shallow">' +
      "<m:ItemShape>" +
      "<t:BaseShape>IdOnly</t:BaseShape>" +
      "<t:AdditionalProperties>" +
      '<t:FieldURI FieldURI="item:Subject"/>' +
      '<t:FieldURI FieldURI="calendar:Start"/>' +
      '<t:FieldURI FieldURI="calendar:End"/>' +
      '<t:FieldURI FieldURI="calendar:IsAllDayEvent"/>' +
      '<t:FieldURI FieldURI="calendar:Location"/>' +
      '<t:FieldURI FieldURI="calendar:Organizer"/>' +
      '<t:FieldURI FieldURI="item:DisplayTo"/>' +
      '<t:FieldURI FieldURI="item:LastModifiedTime"/>' +
      "</t:AdditionalProperties>" +
      "</m:ItemShape>" +
      '<m:CalendarView MaxEntriesReturned="512"' +
      ` StartDate="${window.startsAt.toISOString()}"` +
      ` EndDate="${window.endsAt.toISOString()}"/>` +
      `<m:ParentFolderIds><t:FolderId Id="${escapeXml(folderId)}"/></m:ParentFolderIds>` +
      "</m:FindItem>"
  );

  return parseEwsCalendarItems(xml);
}
