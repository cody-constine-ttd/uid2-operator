package com.uid2.operator.vertx;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.uid2.shared.auth.ClientKey;
import com.uid2.shared.middleware.AuthMiddleware;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.ext.web.RoutingContext;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Semaphore;

//TODO Maybe Come up with a better name
public class APIUsageCaptureHandler implements Handler<RoutingContext> {
    private final ConcurrentLinkedQueue<RoutingContext> requestQueue = new ConcurrentLinkedQueue<>();
    private final Vertx vertx;
    private ConcurrentHashMap<String, Endpoint> pathMap;

    private static final int MAX_AVAILABLE = 1000;
    private final Semaphore available;

    public APIUsageCaptureHandler() {
        vertx = Vertx.vertx();
        pathMap = new ConcurrentHashMap<>();
        vertx.setPeriodic(60000, this::handleJsonSerial);
        available = new Semaphore(MAX_AVAILABLE, true);
    }

    public void handleJsonSerial(Long l) {
        try {
            available.acquire(MAX_AVAILABLE);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        Object[] keys = pathMap.keySet().toArray();
        ObjectMapper mapper = new ObjectMapper();
        String jsonString = null;
        for (int i = 0; i < pathMap.size(); i++) {
            try {
                jsonString = mapper.writeValueAsString(pathMap.get(keys[i]));
            } catch (JsonProcessingException e) {
                e.printStackTrace();
            }
            System.out.println(jsonString);
        }
        pathMap.clear();
        available.release(MAX_AVAILABLE);
    }

    public void handleQueue(Void v) {
        RoutingContext routingContext = requestQueue.poll();
        assert routingContext != null;
        //TODO Add case for no version api
        String path = routingContext.request().path();
        int apiVIndex = path.indexOf("/", 1);
        String apiVersion = path.substring(1, apiVIndex);
        String endpoint = path.substring(apiVIndex+1);

        String referer = routingContext.request().headers().get("Referer");
        ClientKey clientKey = (ClientKey) AuthMiddleware.getAuthClient(routingContext);
        String apiContact = clientKey.getContact();

        Integer siteId = clientKey.getSiteId();
        Domain domain = new Domain(referer, 1, apiContact);

        Endpoint endpointClass = new Endpoint(endpoint, siteId, apiVersion, domain);

        try {
            available.acquire();
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        pathMap.merge(path, endpointClass, this::mergeEndpoint);
        available.release();
    }

    private Endpoint mergeEndpoint(Endpoint a, Endpoint b) {
        a.Merge(b);
        return a;
    }


    @Override
    public void handle(RoutingContext routingContext) {
        routingContext.next();
        requestQueue.offer(routingContext);
        vertx.runOnContext(this::handleQueue);
    }
}

class Domain {
    private String domain;
    private Integer count;
    private String apiContact;

    public Domain(String d, Integer c, String a) {
        domain = d;
        count = c;
        apiContact = a;
    }

    public String getDomain() {
        return domain;
    }

    public Integer getCount() {
        return count;
    }

    public String getApiContact() {
        return apiContact;
    }

    public void merge(Domain d) {
        count += d.getCount();
    }

    public String toString() {
        return "{Domain: " + domain + ", Count: " + count + ", Api_Contact: "+ apiContact + "}";
    }
}

//TODO better name for this too
class Endpoint {
    private String endpoint;
    private Integer siteId;
    private String apiVersion;
    private LinkedList<Domain> domainList;

    private HashMap<String, Integer> domainMap;

    public Endpoint(String e, Integer s, String a, Domain d) {
        endpoint = e;
        siteId = s;
        apiVersion = a;
        domainList = new LinkedList<>();
        domainMap = new HashMap<>();

        AddDomain(d);
    }

    public String getEndpoint() {
        return endpoint;
    }

    public Integer getSiteId() {
        return siteId;
    }

    public String getApiVersion() {
        return apiVersion;
    }

    public LinkedList<Domain> getDomainList() {
        return domainList;
    }

    public void Merge(Endpoint other) {
        other.domainList.forEach(this::AddDomain);
    }

    public void AddDomain(Domain d) {
        String domainName = d.getDomain();
        if(domainMap.containsKey(domainName)) {
            domainList.get(domainMap.get(domainName)).merge(d);
        } else {
            domainList.add(d);
            domainMap.put(domainName, domainList.size()-1);
        }
    }

    public String toString() {
        StringBuilder outString = new StringBuilder("endpoint: " + endpoint + ", site_id: " + siteId + ", api_version: " + apiVersion +
                "\nDomains: ");

        for (int i = 0; i < domainList.size(); i++) {
            outString.append(domainList.get(i).toString()).append(", ");
        }

        return outString.toString();
    }
}
