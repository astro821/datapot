Name:        datapot
Version:     0.1.1
Release:     1%{?dist}
Summary:     DataPot — schema-defined data pots with dynamic external APIs
License:     MIT
URL:         https://github.com/astro821/datapot
BuildArch:   noarch
Requires:    nodejs >= 20

%description
DataPot provides a web management console and dynamically bound
external CR APIs per DataPot (schema + API + port).

%install
mkdir -p %{buildroot}/opt/datapot
mkdir -p %{buildroot}/usr/local/bin
mkdir -p %{buildroot}/usr/lib/systemd/system
# Packaging pipeline should copy built apps into /opt/datapot
install -m 0755 %{_sourcedir}/dpot-wrapper.sh %{buildroot}/usr/local/bin/dpot
install -m 0644 %{_sourcedir}/datapot.service %{buildroot}/usr/lib/systemd/system/datapot.service

%files
/opt/datapot
/usr/local/bin/dpot
/usr/lib/systemd/system/datapot.service

%post
systemctl daemon-reload || true

%changelog
* Tue Sep 22 2026 DataPot Maintainers - 0.1.1-1
- Per-pot MCP tools and bearer access for the collection API
* Mon Mar 21 2026 DataPot Maintainers - 0.1.0-1
- Initial RPM skeleton
