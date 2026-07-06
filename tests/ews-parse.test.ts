import { describe, expect, it } from "vitest";
import {
  normalizeEwsServerUrl,
  parseEwsCalendarFolders,
  parseEwsCalendarItems,
  parseEwsDefaultCalendarFolderId
} from "../src/lib/calendar/ews";

const soapEnvelope = (body: string) =>
  `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>${body}</s:Body>
</s:Envelope>`;

const findFolderResponse = soapEnvelope(`
  <m:FindFolderResponse
    xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
    xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
    <m:ResponseMessages>
      <m:FindFolderResponseMessage ResponseClass="Success">
        <m:ResponseCode>NoError</m:ResponseCode>
        <m:RootFolder TotalItemsInView="2" IncludesLastItemInRange="true">
          <t:Folders>
            <t:CalendarFolder>
              <t:FolderId Id="AAMkAGRl" ChangeKey="AgAAABYAAA"/>
              <t:DisplayName>Календарь</t:DisplayName>
            </t:CalendarFolder>
            <t:CalendarFolder>
              <t:FolderId Id="AAMkAGRm" ChangeKey="AgAAABYAAB"/>
              <t:DisplayName>Дни рождения</t:DisplayName>
            </t:CalendarFolder>
          </t:Folders>
        </m:RootFolder>
      </m:FindFolderResponseMessage>
    </m:ResponseMessages>
  </m:FindFolderResponse>`);

const findItemResponse = soapEnvelope(`
  <m:FindItemResponse
    xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
    xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
    <m:ResponseMessages>
      <m:FindItemResponseMessage ResponseClass="Success">
        <m:ResponseCode>NoError</m:ResponseCode>
        <m:RootFolder TotalItemsInView="1" IncludesLastItemInRange="true">
          <t:Items>
            <t:CalendarItem>
              <t:ItemId Id="AAMkAGI2" ChangeKey="DwAAABYAAA"/>
              <t:Subject>Планёрка</t:Subject>
              <t:DisplayTo>Иван Иванов; Пётр Петров</t:DisplayTo>
              <t:Start>2026-07-06T09:00:00Z</t:Start>
              <t:End>2026-07-06T09:30:00Z</t:End>
              <t:IsAllDayEvent>false</t:IsAllDayEvent>
              <t:Location>https://meet.example.com/room/42</t:Location>
              <t:Organizer>
                <t:Mailbox>
                  <t:Name>Иван Иванов</t:Name>
                  <t:EmailAddress>ivan@example.com</t:EmailAddress>
                </t:Mailbox>
              </t:Organizer>
              <t:LastModifiedTime>2026-07-01T10:00:00Z</t:LastModifiedTime>
            </t:CalendarItem>
          </t:Items>
        </m:RootFolder>
      </m:FindItemResponseMessage>
    </m:ResponseMessages>
  </m:FindItemResponse>`);

const getFolderResponse = soapEnvelope(`
  <m:GetFolderResponse
    xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
    xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
    <m:ResponseMessages>
      <m:GetFolderResponseMessage ResponseClass="Success">
        <m:ResponseCode>NoError</m:ResponseCode>
        <m:Folders>
          <t:CalendarFolder>
            <t:FolderId Id="AAMkAGRl" ChangeKey="AgAAABYAAA"/>
          </t:CalendarFolder>
        </m:Folders>
      </m:GetFolderResponseMessage>
    </m:ResponseMessages>
  </m:GetFolderResponse>`);

const errorResponse = soapEnvelope(`
  <m:FindFolderResponse
    xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
    <m:ResponseMessages>
      <m:FindFolderResponseMessage ResponseClass="Error">
        <m:ResponseCode>ErrorAccessDenied</m:ResponseCode>
      </m:FindFolderResponseMessage>
    </m:ResponseMessages>
  </m:FindFolderResponse>`);

describe("ews response parsing", () => {
  it("parses calendar folders", () => {
    expect(parseEwsCalendarFolders(findFolderResponse)).toEqual([
      {
        id: "AAMkAGRl",
        changeKey: "AgAAABYAAA",
        displayName: "Календарь"
      },
      {
        id: "AAMkAGRm",
        changeKey: "AgAAABYAAB",
        displayName: "Дни рождения"
      }
    ]);
  });

  it("parses calendar items", () => {
    expect(parseEwsCalendarItems(findItemResponse)).toEqual([
      {
        id: "AAMkAGI2",
        subject: "Планёрка",
        start: "2026-07-06T09:00:00Z",
        end: "2026-07-06T09:30:00Z",
        isAllDay: false,
        location: "https://meet.example.com/room/42",
        organizerName: "Иван Иванов",
        displayTo: "Иван Иванов; Пётр Петров",
        lastModified: "2026-07-01T10:00:00Z"
      }
    ]);
  });

  it("parses the default calendar folder id", () => {
    expect(parseEwsDefaultCalendarFolderId(getFolderResponse)).toBe("AAMkAGRl");
  });

  it("throws on error responses", () => {
    expect(() => parseEwsCalendarFolders(errorResponse)).toThrow(
      "ErrorAccessDenied"
    );
  });
});

describe("normalizeEwsServerUrl", () => {
  it("appends the EWS endpoint path to a bare host", () => {
    expect(normalizeEwsServerUrl("mail.example.com")).toBe(
      "https://mail.example.com/EWS/Exchange.asmx"
    );
    expect(normalizeEwsServerUrl("https://mail.example.com/")).toBe(
      "https://mail.example.com/EWS/Exchange.asmx"
    );
  });

  it("completes a URL that already ends with /EWS", () => {
    expect(normalizeEwsServerUrl("https://mail.example.com/EWS")).toBe(
      "https://mail.example.com/EWS/Exchange.asmx"
    );
    expect(normalizeEwsServerUrl("https://mail.example.com/ews/")).toBe(
      "https://mail.example.com/ews/Exchange.asmx"
    );
  });

  it("keeps a full EWS endpoint URL as is", () => {
    expect(normalizeEwsServerUrl("https://mail.example.com/EWS/Exchange.asmx")).toBe(
      "https://mail.example.com/EWS/Exchange.asmx"
    );
  });
});
