declare type TangocardProviderOptions = {
    url: string;
    debug: boolean;
};
declare function TangocardProvider(this: any, options: TangocardProviderOptions): {
    exports: {
        makeUrl: (suffix: string, q: any) => string;
        makeConfig: (config?: any) => any;
        getJSON: (url: string, config?: any) => Promise<any>;
        postJSON: (url: string, config: any) => Promise<any>;
    };
};
export default TangocardProvider;
