var Contoso = Contoso || {};

Contoso.WidgetForm = {
    /**
     * @description Wires up the widget form handlers on load.
     * @param {object} executionContext
     */
    onLoad: function (executionContext) {
        var formContext = executionContext.getFormContext();
        formContext.getAttribute("contoso_status").addOnChange(Contoso.WidgetForm.onSave);
    },

    /**
     * Refreshes the gadget subgrid from the Contoso service.
     * @param {object} formContext
     */
    refreshGadgets: async function (formContext, ...gadgetIds) {
        var grid = formContext.getControl("Gadgets");
        await grid.refresh();
        return gadgetIds.length;
    },

    onSave: function (executionContext, saveArgs) {
        saveArgs.preventDefault();
    }
};

/**
 * @description Formats a widget code for display.
 */
function formatWidgetCode(code, separator = "-") {
    return String(code).split("").join(separator);
}

const buildGadgetUrl = async (widgetId) => "/api/widgets/" + widgetId;

var toTitleCase = value => String(value).toUpperCase();
