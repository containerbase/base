// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "merc",
    platforms: [.macOS(.v11)],
    products: [.executable(name: "sample", targets: ["sample"])],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", .upToNextMinor(from: "0.1.0")),
    ],
    targets: [
        .target(
            name: "sample",
            dependencies: [
                .product(name: "ArgumentParser", package: "swift-argument-parser")
            ]
        )
    ]
)
