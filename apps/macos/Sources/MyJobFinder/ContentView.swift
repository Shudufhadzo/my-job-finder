import SwiftUI
import UniformTypeIdentifiers

private let forest = Color(red: 0.09, green: 0.42, blue: 0.34)
private let canvas = Color(red: 0.95, green: 0.97, blue: 0.95)
private let amber = Color(red: 0.73, green: 0.42, blue: 0.10)

private func displayFont(_ size: CGFloat) -> Font {
    .custom("Avenir Next Demi Bold", size: size)
}

struct ContentView: View {
    @EnvironmentObject private var model: AppViewModel

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            GeometryReader { proxy in
                ZStack {
                    LinearGradient(
                        colors: [canvas, .white, forest.opacity(0.07)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ).ignoresSafeArea()
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) {
                            header
                            metrics
                            insights
                            runBar
                            Label("Opportunities", systemImage: "sparkles.rectangle.stack.fill")
                                .font(displayFont(24))
                                .foregroundStyle(.primary, forest)
                            LazyVStack(spacing: 12) {
                                ForEach(model.filteredJobs) { job in JobCard(job: job) }
                            }
                        }
                        .padding(proxy.size.width < 820 ? 18 : 34)
                        .frame(maxWidth: 1180)
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .frame(minWidth: 760, minHeight: 620)
        .tint(forest)
        .task { await model.load() }
        .sheet(isPresented: $model.showingSetup) { SetupView() }
        .alert(
            "My Job Finder",
            isPresented: Binding(
                get: { model.errorMessage != nil },
                set: { if !$0 { model.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("My Job Finder", systemImage: "briefcase.fill")
                .font(displayFont(18))
                .foregroundStyle(forest)
            Divider()
            Label("Opportunities", systemImage: "sparkles.rectangle.stack")
                .font(.headline)
            Button { model.showingSetup = true } label: {
                Label("Profile and schedule", systemImage: "slider.horizontal.3")
            }.buttonStyle(.plain)
            Spacer()
            VStack(alignment: .leading, spacing: 5) {
                Label("AUTOMATION", systemImage: "clock.arrow.circlepath")
                    .font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(forest)
                Text(model.nextRunText).font(.caption)
            }
            .padding(12)
            .background(forest.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
            Label("Your CV stays local. Analysis reuses your signed-in Codex session.", systemImage: "lock.shield.fill")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(20)
        .navigationSplitViewColumnWidth(min: 190, ideal: 230, max: 270)
    }

    private var header: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 22) {
                heading
                Spacer(minLength: 16)
                runButton
            }
            VStack(alignment: .leading, spacing: 15) {
                heading
                runButton
            }
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("Your next move").font(displayFont(42))
            Text(model.profile.map { "\($0.displayName.split(separator: " ").first ?? "Your")'s search, organised every morning." } ?? "Organised every morning.")
                .font(displayFont(25)).foregroundStyle(forest)
            Text("Fresh roles, ranked fit, and job-specific documents in one private workspace.")
                .foregroundStyle(.secondary)
        }
    }

    private var runButton: some View {
        Button { Task { await model.refresh() } } label: {
            Label("Run search now", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(model.isRunning || model.profile == nil)
    }

    private var metrics: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 12)], spacing: 12) {
            Metric(title: "TRACKED", value: model.jobs.count, symbol: "list.bullet.rectangle.fill", color: .blue)
            Metric(title: "STRONG MATCHES", value: model.strongMatches, symbol: "checkmark.seal.fill", color: forest)
            Metric(title: "DOCUMENT SETS", value: model.readyDocuments, symbol: "doc.on.doc.fill", color: amber)
            Metric(title: "APPLIED", value: model.applied, symbol: "paperplane.fill", color: .purple.opacity(0.75))
        }
    }

    private var insights: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 330), spacing: 12)], spacing: 12) {
            PipelineHealth()
            OpportunityMix()
        }
    }

    private var runBar: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                statusLabel
                Spacer()
                filterField.frame(width: 310)
            }
            VStack(alignment: .leading, spacing: 10) {
                statusLabel
                filterField
            }
        }
        .padding(14)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.gray.opacity(0.18)))
    }

    private var statusLabel: some View {
        HStack(spacing: 8) {
            if model.isRunning { ProgressView().controlSize(.small) }
            Image(systemName: model.isRunning ? "gearshape.2.fill" : "checkmark.circle.fill")
                .foregroundStyle(model.isRunning ? amber : forest)
            Text(model.status).lineLimit(2)
        }
    }

    private var filterField: some View {
        TextField("Filter roles, companies, locations", text: $model.query)
            .textFieldStyle(.roundedBorder)
    }
}

private struct Metric: View {
    let title: String
    let value: Int
    let symbol: String
    let color: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 38, height: 38)
                .background(color.opacity(0.11), in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.caption2.weight(.bold)).tracking(0.9).lineLimit(1)
                Text(value.formatted()).font(displayFont(30)).foregroundStyle(color)
            }
            Spacer(minLength: 0)
        }
        .padding(17)
        .cardSurface()
    }
}

private struct PipelineHealth: View {
    @EnvironmentObject private var model: AppViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Pipeline health", systemImage: "chart.bar.xaxis.ascending")
                .font(.headline).foregroundStyle(forest)
            RateBar(label: "Strong matches", value: model.strongMatchRate, color: forest)
            RateBar(label: "Documents ready", value: model.documentReadyRate, color: amber)
            RateBar(label: "Applied", value: model.appliedRate, color: .purple.opacity(0.75))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .cardSurface()
    }
}

private struct RateBar: View {
    let label: String
    let value: Double
    let color: Color

    var body: some View {
        Grid(horizontalSpacing: 10) {
            GridRow {
                Text(label).foregroundStyle(.secondary).frame(width: 120, alignment: .leading)
                ProgressView(value: value).tint(color)
                Text(value, format: .percent.precision(.fractionLength(0)))
                    .monospacedDigit().frame(width: 38, alignment: .trailing)
            }
        }
    }
}

private struct OpportunityMix: View {
    @EnvironmentObject private var model: AppViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            Label("Opportunity mix", systemImage: "square.grid.2x2.fill")
                .font(.headline).foregroundStyle(.blue)
            if model.topFields.isEmpty {
                Text("Role categories appear after the first search.").foregroundStyle(.secondary)
            } else {
                ForEach(model.topFields) { item in
                    HStack(spacing: 10) {
                        Image(systemName: item.symbol).foregroundStyle(forest).frame(width: 22)
                        Text(item.label).lineLimit(1)
                        GeometryReader { proxy in
                            Capsule().fill(forest.opacity(0.1)).overlay(alignment: .leading) {
                                Capsule().fill(forest).frame(width: proxy.size.width * min(item.ratio, 1))
                            }
                        }.frame(height: 7)
                        Text(item.count.formatted()).font(.caption.weight(.semibold)).monospacedDigit()
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .cardSurface()
    }
}

private struct JobCard: View {
    @EnvironmentObject private var model: AppViewModel
    let job: JobItem

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Label(job.scoreLabel, systemImage: "scope")
                        .font(.caption.weight(.semibold)).foregroundStyle(forest)
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(forest.opacity(0.09), in: Capsule())
                    Text(job.status).font(.caption).foregroundStyle(.secondary)
                }
                Text(job.title).font(displayFont(20))
                Label("\(job.company) • \(job.location)", systemImage: "building.2.fill")
                    .foregroundStyle(.secondary)
                Text(job.fieldLabel).font(.caption2.weight(.bold)).tracking(0.7).foregroundStyle(forest)
                Text(job.excerpt ?? "").font(.callout).foregroundStyle(.secondary).lineLimit(2)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
                Button { model.openJob(job.url) } label: { Label("Open job", systemImage: "safari.fill") }
                Button { model.open(job.selectedCvPdf) } label: { Label("Open CV", systemImage: "doc.text.fill") }.disabled(!job.hasCV)
                Button { model.open(job.selectedCoverLetterPdf) } label: { Label("Cover letter", systemImage: "envelope.fill") }.disabled(!job.hasCoverLetter)
                Button { model.reveal(job.selectedCvPdf) } label: { Label("Show folder", systemImage: "folder.fill") }.disabled(!job.hasCV)
            }
            .buttonStyle(.bordered).controlSize(.small)
        }
        .padding(18)
        .cardSurface()
    }
}

struct SetupView: View {
    @EnvironmentObject private var model: AppViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var cvPath = ""
    @State private var roles = ""
    @State private var locations = ""
    @State private var schedule = Calendar.current.date(from: DateComponents(hour: 10)) ?? Date()
    @State private var enabled = true
    @State private var aiModel = ""
    @State private var reasoningEffort = "medium"
    @State private var importing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Label("Build your daily search", systemImage: "wand.and.stars")
                    .font(displayFont(29)).foregroundStyle(.primary, forest)
                Text("Choose a master CV, target work, locations, and the local Codex model used for document analysis.")
                    .foregroundStyle(.secondary)
                Form {
                    TextField("Full name", text: $name)
                    HStack {
                        TextField("Master CV", text: $cvPath).disabled(true)
                        Button { importing = true } label: { Label("Choose", systemImage: "doc.badge.plus") }
                    }
                    TextField("Roles, separated by commas", text: $roles)
                    TextField("Locations, separated by commas", text: $locations)
                    DatePicker("Run every day at", selection: $schedule, displayedComponents: .hourAndMinute)
                    Toggle("Daily background search", isOn: $enabled)
                    Picker("AI model", selection: $aiModel) {
                        ForEach(model.availableModels, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Reasoning effort", selection: $reasoningEffort) {
                        ForEach(model.availableReasoningEfforts, id: \.self) { Text($0.capitalized).tag($0) }
                    }
                }.formStyle(.grouped)
                HStack {
                    Spacer()
                    Button("Cancel") { dismiss() }
                    Button { save() } label: { Label("Save and schedule", systemImage: "calendar.badge.checkmark") }
                        .buttonStyle(.borderedProminent)
                        .disabled(name.isEmpty || cvPath.isEmpty || roles.isEmpty || locations.isEmpty || aiModel.isEmpty)
                }
            }
            .padding(28)
        }
        .frame(minWidth: 520, idealWidth: 680, maxWidth: 760, minHeight: 580, idealHeight: 680)
        .fileImporter(
            isPresented: $importing,
            allowedContentTypes: [.pdf, .plainText, UTType(filenameExtension: "docx")!]
        ) { result in
            if case .success(let url) = result { cvPath = url.path }
        }
        .onAppear {
            if let profile = model.profile {
                name = profile.displayName
                cvPath = profile.masterCvPath
                roles = profile.targetRoles.joined(separator: ", ")
                locations = profile.locations.joined(separator: ", ")
                enabled = profile.scheduleEnabled
                aiModel = profile.aiModel
                reasoningEffort = profile.reasoningEffort
            } else {
                aiModel = model.availableModels.first ?? "gpt-5.3-codex"
                reasoningEffort = model.availableReasoningEfforts.first ?? "medium"
            }
        }
    }

    private func save() {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let split: (String) -> [String] = {
            $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        }
        Task {
            await model.save(.init(
                displayName: name,
                sourceCvPath: cvPath,
                targetRoles: split(roles),
                locations: split(locations),
                scheduleTime: formatter.string(from: schedule),
                scheduleEnabled: enabled,
                aiModel: aiModel,
                reasoningEffort: reasoningEffort
            ))
        }
    }
}

private extension View {
    func cardSurface() -> some View {
        background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 17))
            .overlay(RoundedRectangle(cornerRadius: 17).stroke(.gray.opacity(0.16)))
    }
}
