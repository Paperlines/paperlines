{
  description = "Local-first reference manager: library, notes and citation graph";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      branding = builtins.fromJSON (builtins.readFile ./branding.json);
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      package =
        pkgs:
        pkgs.callPackage ./nix/package.nix {
          inherit branding;
          src = self;
        };
    in
    {
      packages = forAll (pkgs: {
        default = package pkgs;
        ${branding.binaryName} = package pkgs;
      });

      # NixOS / home-manager: nixpkgs.overlays = [ inputs.<name>.overlays.default ];
      overlays.default = final: _prev: { ${branding.binaryName} = package final; };

      apps = forAll (pkgs: {
        default = {
          type = "app";
          program = "${package pkgs}/bin/${branding.binaryName}-app";
        };
        cli = {
          type = "app";
          program = "${package pkgs}/bin/${branding.cliCommand}";
        };
      });

      # `nix develop`: everything for `pnpm tauri dev`, the tests and the CLI
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          inputsFrom = [ (package pkgs) ];
          packages = with pkgs; [
            cargo
            rustc
            clippy
            rustfmt
            rust-analyzer
            cargo-tauri
            nodejs
            pnpm
          ];
          # GSettings schemas and TLS for WebKitGTK when running from the shell
          shellHook = ''
            export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS"
            export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules/"
          '';
        };
      });

      checks = forAll (pkgs: {
        package = package pkgs;
      });

      formatter = forAll (pkgs: pkgs.nixfmt-rfc-style);
    };
}
