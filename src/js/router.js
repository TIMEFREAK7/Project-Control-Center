(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var routes = {};
  var defaultRoute = "dashboard";

  function register(name, renderFn) {
    routes[name] = renderFn;
  }

  function currentRouteName() {
    var hash = window.location.hash.replace(/^#\/?/, "");
    return hash || defaultRoute;
  }

  function render() {
    var name = currentRouteName();
    var renderFn = routes[name];
    var outlet = document.getElementById("page-outlet");
    if (!outlet) return;

    if (!renderFn) {
      outlet.innerHTML = "";
      renderFn = routes["notfound"];
    }

    if (window.PCC.layout) {
      window.PCC.layout.setActiveNav(name);
    }

    outlet.innerHTML = "";
    renderFn(outlet);
  }

  function go(name) {
    window.location.hash = "#/" + name;
  }

  window.addEventListener("hashchange", render);

  window.PCC.router = {
    register: register,
    render: render,
    go: go,
    currentRouteName: currentRouteName,
  };
})();
