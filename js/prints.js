/* Print store. The Buy Button stays off until Shopify is connected. */
(function (root) {
  root.SH_PRINTS = {
    enabled: false,
    creditOnPrint: false,
    currency: "CAD",
    prices: {
      "5x5": null,
      "10x10": null,
      "12x12": null,
      "20x20": null,
      digital: 10
    },
    add: function () {}
  };

  function syncCreditPrint() {
    var doc = root.document;
    if (!doc || !doc.documentElement) return;
    doc.documentElement.classList.toggle("sh-credit-print", root.SH_PRINTS.creditOnPrint === true);
  }

  syncCreditPrint();
  root.addEventListener("beforeprint", syncCreditPrint);
})(window);
