// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MyJobFinder",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "MyJobFinder", targets: ["MyJobFinder"])],
    targets: [
        .executableTarget(name: "MyJobFinder"),
        .testTarget(name: "MyJobFinderTests", dependencies: ["MyJobFinder"])
    ]
)
