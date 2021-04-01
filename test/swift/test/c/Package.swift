// swift-tools-version:5.2
import PackageDescription

let package = Package(
    name: "merc",
    platforms: [.macOS(.v10_15)],
    products: [.executable(name: "sample", targets: ["sample"])],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", .upToNextMinor(from: "0.2.2")),
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
