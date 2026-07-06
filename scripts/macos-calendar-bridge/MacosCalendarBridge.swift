import EventKit
import Foundation

struct Options {
    let endpoint: URL
    let token: String
    let userEmail: String?
    let accountEmail: String
    let sourceDisplayName: String
    let calendarNameFilter: String?
    let pastDays: Int
    let futureDays: Int
    let listOnly: Bool
}

struct ImportPayload: Encodable {
    let accountEmail: String
    let calendarExternalId: String
    let calendarName: String
    let events: [CalendarEventPayload]
    let sourceDisplayName: String
    let userEmail: String?
}

struct CalendarEventPayload: Encodable {
    let externalEventId: String
    let title: String
    let startsAt: String
    let endsAt: String
    let isAllDay: Bool
    let location: String?
    let organizer: String?
    let attendeesSummary: String?
    let eventUrl: String?
    let providerUpdatedAt: String?
}

enum BridgeError: Error, CustomStringConvertible {
    case missingEnvironment(String)
    case invalidURL(String)
    case calendarAccessDenied
    case requestFailed(Int, String)

    var description: String {
        switch self {
        case .missingEnvironment(let name):
            return "\(name) is required"
        case .invalidURL(let value):
            return "Invalid URL: \(value)"
        case .calendarAccessDenied:
            return "Calendar access was denied"
        case .requestFailed(let statusCode, let body):
            return "Import request failed with HTTP \(statusCode): \(body)"
        }
    }
}

let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    return formatter
}()

func env(_ name: String) -> String? {
    let value = ProcessInfo.processInfo.environment[name]?.trimmingCharacters(
        in: .whitespacesAndNewlines
    )
    return value?.isEmpty == false ? value : nil
}

func requiredEnv(_ name: String) throws -> String {
    guard let value = env(name) else {
        throw BridgeError.missingEnvironment(name)
    }
    return value
}

func intEnv(_ name: String, defaultValue: Int) -> Int {
    guard let value = env(name), let parsed = Int(value) else {
        return defaultValue
    }
    return parsed
}

func readOptions() throws -> Options {
    let baseURL = env("TASK_TRACKER_BASE_URL") ?? "http://localhost:3001"
    guard let endpoint = URL(
        string: baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            + "/api/calendar/import/local"
    ) else {
        throw BridgeError.invalidURL(baseURL)
    }

    let userEmail = env("TASK_TRACKER_USER_EMAIL")
        ?? env("LOCAL_CALENDAR_IMPORT_USER_EMAIL")
    let accountEmail = env("MACOS_CALENDAR_ACCOUNT_EMAIL")
        ?? userEmail
        ?? "macos-calendar"

    return Options(
        endpoint: endpoint,
        token: try requiredEnv("LOCAL_CALENDAR_IMPORT_TOKEN"),
        userEmail: userEmail,
        accountEmail: accountEmail,
        sourceDisplayName: env("MACOS_CALENDAR_SOURCE_NAME") ?? "macOS Calendar",
        calendarNameFilter: env("MACOS_CALENDAR_NAME_CONTAINS"),
        pastDays: intEnv("MACOS_CALENDAR_PAST_DAYS", defaultValue: 60),
        futureDays: intEnv("MACOS_CALENDAR_FUTURE_DAYS", defaultValue: 60),
        listOnly: env("MACOS_CALENDAR_LIST") == "1"
    )
}

func requestCalendarAccess(_ store: EKEventStore) throws {
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    var requestError: Error?

    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { accessGranted, error in
            granted = accessGranted
            requestError = error
            semaphore.signal()
        }
    } else {
        store.requestAccess(to: .event) { accessGranted, error in
            granted = accessGranted
            requestError = error
            semaphore.signal()
        }
    }

    semaphore.wait()

    if let requestError {
        throw requestError
    }

    if !granted {
        throw BridgeError.calendarAccessDenied
    }
}

func selectedCalendars(store: EKEventStore, options: Options) -> [EKCalendar] {
    let calendars = store.calendars(for: .event)
        .filter { $0.allowsContentModifications || $0.type == .subscription || $0.type == .calDAV || $0.type == .exchange }
        .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }

    guard let filter = options.calendarNameFilter?.lowercased() else {
        return calendars
    }

    return calendars.filter { $0.title.lowercased().contains(filter) }
}

func printCalendars(_ calendars: [EKCalendar]) {
    for calendar in calendars {
        print(
            [
                "title=\(calendar.title)",
                "source=\(calendar.source.title)",
                "type=\(calendar.type.rawValue)",
                "id=\(calendar.calendarIdentifier)"
            ].joined(separator: " | ")
        )
    }
}

func eventIdentifier(_ event: EKEvent, calendar: EKCalendar) -> String {
    let stablePart = event.eventIdentifier
        ?? "\(event.title ?? "untitled"):\(isoFormatter.string(from: event.startDate)):\(isoFormatter.string(from: event.endDate))"
    return "\(calendar.calendarIdentifier):\(stablePart):\(isoFormatter.string(from: event.startDate))"
}

func eventPayload(_ event: EKEvent, calendar: EKCalendar) -> CalendarEventPayload? {
    guard let startDate = event.startDate, let endDate = event.endDate, endDate > startDate else {
        return nil
    }

    let attendeeCount = event.attendees?.count ?? 0
    let organizerName = event.organizer?.name
        ?? event.organizer?.url.absoluteString
    let rawTitle = event.title ?? ""
    let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? "Без названия"
        : rawTitle

    return CalendarEventPayload(
        externalEventId: eventIdentifier(event, calendar: calendar),
        title: title,
        startsAt: isoFormatter.string(from: startDate),
        endsAt: isoFormatter.string(from: endDate),
        isAllDay: event.isAllDay,
        location: event.location,
        organizer: organizerName,
        attendeesSummary: attendeeCount > 0 ? "\(attendeeCount) участников" : nil,
        eventUrl: event.url?.absoluteString,
        providerUpdatedAt: event.lastModifiedDate.map { isoFormatter.string(from: $0) }
    )
}

func fetchEvents(store: EKEventStore, calendar: EKCalendar, options: Options) -> [CalendarEventPayload] {
    let start = Calendar.current.date(
        byAdding: .day,
        value: -options.pastDays,
        to: Date()
    ) ?? Date()
    let end = Calendar.current.date(
        byAdding: .day,
        value: options.futureDays,
        to: Date()
    ) ?? Date()
    let predicate = store.predicateForEvents(
        withStart: start,
        end: end,
        calendars: [calendar]
    )

    return store.events(matching: predicate)
        .compactMap { eventPayload($0, calendar: calendar) }
}

func postPayload(_ payload: ImportPayload, options: Options) throws {
    var request = URLRequest(url: options.endpoint)
    request.httpMethod = "POST"
    request.setValue("Bearer \(options.token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(payload)

    let semaphore = DispatchSemaphore(value: 0)
    var responseStatus = 0
    var responseBody = ""
    var responseError: Error?

    URLSession.shared.dataTask(with: request) { data, response, error in
        responseError = error
        responseStatus = (response as? HTTPURLResponse)?.statusCode ?? 0
        if let data {
            responseBody = String(data: data, encoding: .utf8) ?? ""
        }
        semaphore.signal()
    }.resume()

    semaphore.wait()

    if let responseError {
        throw responseError
    }

    if !(200...299).contains(responseStatus) {
        throw BridgeError.requestFailed(responseStatus, responseBody)
    }

    print(responseBody)
}

func run() throws {
    let options = try readOptions()
    let store = EKEventStore()
    try requestCalendarAccess(store)

    let calendars = selectedCalendars(store: store, options: options)

    if options.listOnly {
        printCalendars(calendars)
        return
    }

    if calendars.isEmpty {
        print("No calendars matched the current filter")
        return
    }

    for calendar in calendars {
        let events = fetchEvents(store: store, calendar: calendar, options: options)
        let payload = ImportPayload(
            accountEmail: options.accountEmail,
            calendarExternalId: "macos:\(calendar.calendarIdentifier)",
            calendarName: calendar.title,
            events: events,
            sourceDisplayName: options.sourceDisplayName,
            userEmail: options.userEmail
        )

        try postPayload(payload, options: options)
        print("Synced \(events.count) events from \(calendar.title)")
    }
}

do {
    try run()
} catch {
    fputs("\(error)\n", stderr)
    exit(1)
}
