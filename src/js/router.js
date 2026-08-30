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

    // React migration (see reactBridge.js): unmount any active React root BEFORE the
    // raw DOM wipe below, so a page's real effect cleanup runs instead of its root being
    // silently abandoned mid-navigation. A no-op whenever the outgoing page was vanilla.
    if (window.PCC.reactBridge) {
      window.PCC.reactBridge.unmount();
    }

    outlet.innerHTML = "";
    renderFn(outlet);
  }

  // Bug fix (Daily-Use Audit, Phase 1): go() used to just set location.hash, relying on the
  // async "hashchange" listener below to actually render — but nearly every call site also
  // called render() explicitly right after go(), for instant feedback instead of waiting on
  // the event. That meant every navigation rendered the destination page TWICE: once from the
  // call site's explicit render(), once again moments later when hashchange fired. go() now
  // renders synchronously itself (so every call site gets the same instant feedback, including
  // the ones that previously relied on the async event alone) and arms a flag so the hashchange
  // this same navigation triggers doesn't render a second time. Manual hash edits and real
  // browser back/forward navigation never go through go(), so they still render via the
  // listener exactly as before.
  var suppressNextHashRender = false;

  function go(name) {
    var target = "#/" + name;
    if (window.location.hash === target) {
      render();
      return;
    }
    suppressNextHashRender = true;
    window.location.hash = target;
    render();
  }

  window.addEventListener("hashchange", function () {
    if (suppressNextHashRender) {
      suppressNextHashRender = false;
      return;
    }
    render();
  });

  window.PCC.router = {
    register: register,
    render: render,
    go: go,
    currentRouteName: currentRouteName,
  };
})();
