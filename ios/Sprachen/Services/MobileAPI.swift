import Foundation

enum MobileAPIError: LocalizedError {
    case missingServer
    case invalidResponse
    case httpStatus(Int)
    case serverMessage(String)

    var errorDescription: String? {
        switch self {
        case .missingServer:
            return "Bitte zuerst die Mac-Adresse in den Einstellungen setzen."
        case .invalidResponse:
            return "Die Antwort vom Mac war ungültig."
        case .httpStatus(let code):
            return "Mac antwortet nicht (\(code))."
        case .serverMessage(let message):
            return message
        }
    }
}

struct MobileAPI {
    var baseURL: URL

    func health() async throws -> MobileHealth {
        try await get(path: "/api/mobile/health")
    }

    func daily(targetLang: String) async throws -> MobileDailyResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "api/mobile/daily"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "targetLang", value: targetLang)]
        guard let url = components?.url else { throw MobileAPIError.invalidResponse }
        return try await get(url: url)
    }

    func audioData(path: String) async throws -> Data {
        let url = try resolve(path)
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw MobileAPIError.invalidResponse
        }
        guard (200 ... 299).contains(http.statusCode) else {
            throw MobileAPIError.httpStatus(http.statusCode)
        }
        return data
    }

    private func get<T: Decodable>(path: String) async throws -> T {
        try await get(url: try resolve(path))
    }

    private func get<T: Decodable>(url: URL) async throws -> T {
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw MobileAPIError.invalidResponse
        }
        guard (200 ... 299).contains(http.statusCode) else {
            if let message = try? JSONDecoder().decode(ServerError.self, from: data).error {
                throw MobileAPIError.serverMessage(message)
            }
            throw MobileAPIError.httpStatus(http.statusCode)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw MobileAPIError.invalidResponse
        }
    }

    private func resolve(_ path: String) throws -> URL {
        let trimmed = path.hasPrefix("/") ? path : "/\(path)"
        guard let url = URL(string: trimmed, relativeTo: baseURL)?.absoluteURL else {
            throw MobileAPIError.invalidResponse
        }
        return url
    }
}

private struct ServerError: Decodable {
    var error: String?
}

enum ClipPath {
    static func normalize(_ url: String) -> String {
        if let parsed = URL(string: url), parsed.scheme != nil {
            let path = parsed.path
            if let query = parsed.query, !query.isEmpty {
                return "\(path)?\(query)"
            }
            return path
        }
        return url
    }

    static func fileName(for url: String) -> String {
        let normalized = normalize(url)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "?", with: "_")
            .replacingOccurrences(of: "&", with: "_")
            .replacingOccurrences(of: "=", with: "_")
        let safe = normalized.unicodeScalars.map { scalar in
            CharacterSet.alphanumerics.contains(scalar) || scalar == "_" || scalar == "-"
                ? Character(scalar)
                : "_"
        }
        let name = String(safe)
        return String(name.prefix(160))
    }

    static func audioExtension(_ data: Data) -> String {
        if data.count >= 12,
           data.prefix(4) == Data("RIFF".utf8),
           data.subdata(in: 8 ..< 12) == Data("WAVE".utf8) {
            return "wav"
        }
        return "mp3"
    }

    static func uniqueURLs(in items: [MobileDailyItem]) -> [String] {
        var seen = Set<String>()
        var urls: [String] = []
        for item in items {
            for clip in item.clips where !clip.url.isEmpty {
                let path = normalize(clip.url)
                if seen.insert(path).inserted {
                    urls.append(path)
                }
            }
        }
        return urls
    }
}
